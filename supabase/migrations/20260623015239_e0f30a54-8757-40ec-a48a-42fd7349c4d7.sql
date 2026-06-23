-- Backfill header_discount_share and net_unit_cost for historical invoices
-- with header-level discounts (invoices.discount > 0).
-- Distributes header amount proportionally to each line's net (qty*unit_price - line_discount),
-- with the last non-zero line absorbing the rounding remainder.

DO $$
DECLARE
  inv RECORD;
  ln RECORD;
  total_net numeric;
  header_amt numeric;
  running numeric;
  last_id uuid;
  share numeric;
  line_net numeric;
  qty numeric;
  up numeric;
  ld numeric;
  computed_share numeric;
BEGIN
  FOR inv IN
    SELECT id, COALESCE(discount,0)::numeric AS header_disc
    FROM invoices
    WHERE COALESCE(discount,0) > 0
  LOOP
    header_amt := round(inv.header_disc::numeric, 2);

    -- Sum of line nets (after line-level discount), non-negative
    SELECT COALESCE(SUM(GREATEST(0, COALESCE(quantity,0)*COALESCE(unit_price,0) - COALESCE(discount,0))), 0)
      INTO total_net
    FROM invoice_line_items
    WHERE invoice_id = inv.id;

    IF total_net <= 0 THEN
      -- Nothing to distribute against; zero shares, recompute net_unit_cost from line discount only
      UPDATE invoice_line_items
        SET header_discount_share = 0,
            net_unit_cost = CASE
              WHEN COALESCE(quantity,0) > 0
                THEN round(((COALESCE(quantity,0)*COALESCE(unit_price,0)) - COALESCE(discount,0) - 0) / quantity, 4)
              ELSE COALESCE(unit_price,0)
            END
        WHERE invoice_id = inv.id;
      CONTINUE;
    END IF;

    running := 0;
    last_id := NULL;

    FOR ln IN
      SELECT id, COALESCE(quantity,0)::numeric AS quantity,
             COALESCE(unit_price,0)::numeric AS unit_price,
             COALESCE(discount,0)::numeric AS discount
      FROM invoice_line_items
      WHERE invoice_id = inv.id
      ORDER BY created_at NULLS LAST, id
    LOOP
      qty := ln.quantity;
      up := ln.unit_price;
      ld := ln.discount;
      line_net := GREATEST(0, qty*up - ld);

      IF line_net <= 0 THEN
        computed_share := 0;
      ELSE
        computed_share := round((line_net / total_net) * header_amt, 2);
        last_id := ln.id;
      END IF;

      UPDATE invoice_line_items
        SET header_discount_share = computed_share,
            net_unit_cost = CASE
              WHEN qty > 0 THEN round((qty*up - ld - computed_share) / qty, 4)
              ELSE up
            END
        WHERE id = ln.id;

      running := round(running + computed_share, 2);
    END LOOP;

    -- Absorb rounding remainder on last non-zero-net line
    IF last_id IS NOT NULL AND running <> header_amt THEN
      SELECT COALESCE(quantity,0)::numeric, COALESCE(unit_price,0)::numeric,
             COALESCE(discount,0)::numeric, COALESCE(header_discount_share,0)::numeric
        INTO qty, up, ld, share
      FROM invoice_line_items WHERE id = last_id;

      computed_share := round(share + (header_amt - running), 2);

      UPDATE invoice_line_items
        SET header_discount_share = computed_share,
            net_unit_cost = CASE
              WHEN qty > 0 THEN round((qty*up - ld - computed_share) / qty, 4)
              ELSE up
            END
        WHERE id = last_id;
    END IF;
  END LOOP;
END $$;