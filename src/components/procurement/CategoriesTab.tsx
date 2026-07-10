import React, { useState } from "react";
import ProductCategoriesPanel from "@/components/procurement/ProductCategoriesPanel";
import UomOptionsPanel from "@/components/procurement/UomOptionsPanel";
import { cn } from "@/lib/utils";

const TABS = [
  { value: "products", label: "Bill & Invoice Categories" },
  { value: "uom", label: "Units of Measure" },
] as const;

export default function CategoriesTab() {
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("products");
  return (
    <div className="w-full space-y-4">
      <div className="inline-flex items-center gap-1 rounded-lg bg-muted/40 p-1 border border-border/50">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              "px-3 py-1.5 text-xs sm:text-sm rounded-md font-medium transition-colors min-h-[36px]",
              tab === t.value
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "products" ? <ProductCategoriesPanel /> : <UomOptionsPanel />}
    </div>
  );
}
