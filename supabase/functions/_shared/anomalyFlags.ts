/**
 * Guardrails for `invoice_anomaly` output.
 *
 * `normalized_unit_cost` is price-comparison metadata only. A missing value must
 * never produce a warning — in particular never `missing_coding`, which the
 * model previously emitted whenever price normalization was unavailable.
 */

const PRICE_FLAG_TYPES = new Set(["price_spike", "price_drop_check"]);

function mentionsMissingNormalization(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes("normalized_unit_cost") ||
    t.includes("normalized unit cost") ||
    t.includes("normalised unit cost") ||
    t.includes("pack size") ||
    t.includes("pack_size") ||
    t.includes("price normalization") ||
    t.includes("price normalisation")
  );
}

export interface AnomalyLineRef {
  id?: string | null;
  product_master_id?: string | null;
  normalized_unit_cost?: number | string | null;
}

/**
 * Drops flags that exist only because normalized cost is unavailable:
 *  - any `missing_coding` flag citing normalized cost / pack size / normalization
 *  - price spike / drop flags for lines whose normalized_unit_cost is null
 */
export function sanitizeAnomalyOutput(outputAction: any, lines: AnomalyLineRef[] = []): any {
  if (!outputAction || typeof outputAction !== "object") return outputAction;
  const flags = Array.isArray(outputAction.flags) ? outputAction.flags : [];

  const noNorm = new Set<string>();
  for (const l of lines) {
    const has = l?.normalized_unit_cost !== null && l?.normalized_unit_cost !== undefined &&
      Number.isFinite(Number(l.normalized_unit_cost)) && Number(l.normalized_unit_cost) > 0;
    if (!has) {
      if (l?.id) noNorm.add(String(l.id));
      if (l?.product_master_id) noNorm.add(String(l.product_master_id));
    }
  }

  const kept = flags.filter((f: any) => {
    const type = String(f?.type ?? "");
    const blob = `${f?.reason ?? ""} ${JSON.stringify(f?.evidence ?? {})}`;

    if (type === "missing_coding") {
      // Never allow missing_coding based on price normalization.
      if (mentionsMissingNormalization(blob)) return false;
    }

    if (PRICE_FLAG_TYPES.has(type)) {
      const ref = f?.suspected_ref ?? {};
      const lineId = ref.line_id ? String(ref.line_id) : null;
      const pmId = ref.product_master_id ? String(ref.product_master_id) : null;
      if ((lineId && noNorm.has(lineId)) || (pmId && noNorm.has(pmId))) return false;
      if (mentionsMissingNormalization(blob) && /null|missing|unavailable|unknown/i.test(blob)) return false;
    }

    return true;
  });

  return { ...outputAction, flags: kept };
}
