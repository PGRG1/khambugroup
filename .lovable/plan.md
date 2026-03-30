

## Fix: Allow same supplier to have multiple entries per product

### Problem
The `product_suppliers` table has a unique constraint `product_suppliers_product_master_id_supplier_key` on `(product_master_id, supplier)`. This prevents two entries from the same supplier (e.g., Ming Kee) being linked to the same product — but that's exactly what's needed when the same supplier offers different packaging variants (1kg x 10pk vs 2.3kg x 6pk).

### Solution
Drop the unique constraint. The combination of `product_master_id + supplier` is not truly unique when a supplier offers multiple pack sizes of the same product.

### Changes

**Database migration:**
```sql
ALTER TABLE product_suppliers 
DROP CONSTRAINT product_suppliers_product_master_id_supplier_key;
```

Single migration, no code changes needed.

