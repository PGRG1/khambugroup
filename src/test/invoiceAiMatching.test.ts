import { describe, expect, it } from "vitest";
import { resolveAiMatchScope, scopePMToSupplier } from "@/utils/invoiceAiMatching";

const suppliers = [
  { id: "sup-mingkee", name: "Ming Kee Seafood Company Limited" },
  { id: "sup-other", name: "Pacific Foods Ltd" },
];

const productMaster = [
  { id: "pm-1", internal_sku: "MK-GROUPER", supplier: "Ming Kee Seafood Company Limited", supplier_product_name: "Fresh Grouper" },
  { id: "pm-2", internal_sku: "PF-SALMON", supplier: "Pacific Foods Ltd", supplier_product_name: "Salmon Fillet" },
];

describe("resolveAiMatchScope", () => {
  it("selected supplier_id + shortened OCR supplier_name still finds that supplier's rows", () => {
    const scope = resolveAiMatchScope(
      suppliers,
      { supplier_id: "sup-mingkee", supplier_name: "Ming Kee Seafood" },
      productMaster,
    );
    expect(scope.status).toBe("ok");
    if (scope.status === "ok") {
      expect(scope.supplierName).toBe("Ming Kee Seafood Company Limited");
      expect(scope.scopedPM.map((p) => p.internal_sku)).toEqual(["MK-GROUPER"]);
    }
  });

  it("blank supplier_id reports no_supplier", () => {
    expect(resolveAiMatchScope(suppliers, { supplier_id: "", supplier_name: "Ming Kee Seafood" }, productMaster).status).toBe("no_supplier");
    expect(resolveAiMatchScope(suppliers, { supplier_id: null, supplier_name: "X" }, productMaster).status).toBe("no_supplier");
    expect(resolveAiMatchScope(suppliers, { supplier_name: "X" }, productMaster).status).toBe("no_supplier");
  });

  it("valid supplier with zero Product Master rows reports no_products", () => {
    const scope = resolveAiMatchScope(
      suppliers,
      { supplier_id: "sup-other", supplier_name: "Pacific Foods Ltd" },
      productMaster.filter((p) => p.supplier !== "Pacific Foods Ltd"),
    );
    expect(scope).toEqual({ status: "no_products", supplierName: "Pacific Foods Ltd" });
  });

  it("cross-supplier rows remain excluded", () => {
    const scope = resolveAiMatchScope(
      suppliers,
      { supplier_id: "sup-mingkee", supplier_name: "Ming Kee Seafood Company Limited" },
      productMaster,
    );
    expect(scope.status).toBe("ok");
    if (scope.status === "ok") {
      expect(scope.scopedPM.every((p) => p.supplier === "Ming Kee Seafood Company Limited")).toBe(true);
      expect(scope.scopedPM.some((p) => p.internal_sku === "PF-SALMON")).toBe(false);
    }
  });

  it("falls back to OCR supplier_name only for a just-created supplier missing from the list", () => {
    const scope = resolveAiMatchScope(
      suppliers,
      { supplier_id: "sup-new", supplier_name: "Ming Kee Seafood Company Limited" },
      productMaster,
    );
    expect(scope.status).toBe("ok");
    if (scope.status === "ok") expect(scope.supplierName).toBe("Ming Kee Seafood Company Limited");
  });
});

describe("scopePMToSupplier", () => {
  it("stays strict: no partial/contains matching; Ltd/Limited variants normalize equal", () => {
    expect(scopePMToSupplier(productMaster, "Ming Kee")).toEqual([]);
    expect(scopePMToSupplier(productMaster, "Ming Kee Seafood Co., Ltd.")).toHaveLength(1);
    expect(scopePMToSupplier(productMaster, "Ming Kee Seafood Company Limited")).toHaveLength(1);
  });
});
