import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUomOptions, mergeWithLegacy, type UomType } from "@/hooks/useUomOptions";

interface Props {
  value: string;
  onChange: (v: string) => void;
  type: UomType;
  placeholder?: string;
  legacyValues?: string[];
  className?: string;
}

/**
 * UOM dropdown sourced from the Categories → Units of Measure registry.
 * Falls back to showing existing free-text values as "(legacy)" entries
 * so older products remain visible until normalized.
 */
export default function UomSelect({ value, onChange, type, placeholder, legacyValues = [], className }: Props) {
  const { items } = useUomOptions();
  const merged = mergeWithLegacy(items, type, [...legacyValues, value].filter(Boolean));
  // Radix Select cannot use empty string — use a sentinel for "none".
  const NONE = "__none__";
  const v = value && value.trim() !== "" ? value : NONE;
  return (
    <Select value={v} onValueChange={(val) => onChange(val === NONE ? "" : val)}>
      <SelectTrigger className={className ?? "h-9 text-sm"}>
        <SelectValue placeholder={placeholder ?? "Select UOM"} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>—</SelectItem>
        {merged.map(opt => (
          <SelectItem key={opt.code} value={opt.code}>
            {opt.label}{opt.legacy ? "" : ` (${opt.code})`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
