import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUomOptions, type UomType } from "@/hooks/useUomOptions";
import { normalizeUom } from "@/utils/uomNormalization";

interface Props {
  value: string;
  onChange: (v: string) => void;
  type: UomType;
  placeholder?: string;
  /** @deprecated legacy free-text values are normalized centrally and no longer listed. */
  legacyValues?: string[];
  className?: string;
}

/**
 * UOM dropdown sourced only from the active canonical UOM registry
 * (Categories → Units of Measure). Legacy spellings are normalized to their
 * canonical code, so no "(legacy)" entries are ever offered.
 *
 * A stored value with no canonical equivalent stays selectable (so the record
 * remains readable) but is flagged as needing setup instead of being guessed.
 */
export default function UomSelect({ value, onChange, type, placeholder, className }: Props) {
  const { items } = useUomOptions();
  const canonicalOptions = items
    .filter((o) => o.uom_type === type && o.is_active)
    .map((o) => ({ code: o.code, label: o.label }));

  const normalized = normalizeUom(value, type);
  const known = canonicalOptions.some((o) => o.code.toLowerCase() === normalized.toLowerCase());
  const needsSetup = normalized !== "" && !known;

  // Radix Select cannot use empty string — sentinel for "not set" (never a UOM value).
  const NONE = "__none__";
  const v = normalized !== "" ? normalized : NONE;

  return (
    <Select value={v} onValueChange={(val) => onChange(val === NONE ? "" : val)}>
      <SelectTrigger className={className ?? "h-9 text-sm"}>
        <SelectValue placeholder={placeholder ?? "Select UOM"} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Not set</SelectItem>
        {needsSetup && (
          <SelectItem value={normalized} title="No canonical unit yet — needs manual setup">
            {normalized} — needs setup
          </SelectItem>
        )}
        {canonicalOptions.map((opt) => (
          <SelectItem key={opt.code} value={opt.code}>
            {opt.label} ({opt.code})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
