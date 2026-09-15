import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { toast } from "sonner";
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
  /** Opt-in: offer "+ Add new unit" inside the dropdown (scanner add/edit screens). */
  allowCreate?: boolean;
}

const TYPE_LABEL: Record<UomType, string> = {
  purchase: "Purchase",
  stock: "Stock (internal)",
  base: "Recipe / base",
};

/**
 * UOM dropdown sourced only from the active canonical UOM registry
 * (Categories → Units of Measure). Legacy spellings are normalized to their
 * canonical code, so no "(legacy)" entries are ever offered.
 *
 * A stored value with no canonical equivalent stays selectable (so the record
 * remains readable) but is flagged as needing setup instead of being guessed.
 */
export default function UomSelect({ value, onChange, type, placeholder, className, allowCreate = false }: Props) {
  const { items, createItem } = useUomOptions();
  const [selectOpen, setSelectOpen] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newLabel, setNewLabel] = React.useState("");
  const [newCode, setNewCode] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState("");

  const canonicalOptions = items
    .filter((o) => o.uom_type === type && o.is_active)
    .map((o) => ({ code: o.code, label: o.label }));

  const normalized = normalizeUom(value, type);
  const known = canonicalOptions.some((o) => o.code.toLowerCase() === normalized.toLowerCase());
  const needsSetup = normalized !== "" && !known;

  // Radix Select cannot use empty string — sentinel for "not set" (never a UOM value).
  const NONE = "__none__";
  const v = normalized !== "" ? normalized : NONE;

  const openCreate = () => {
    setSelectOpen(false);
    setNewLabel("");
    setNewCode("");
    setFormError("");
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    const label = newLabel.trim();
    const code = newCode.trim();
    if (!label || !code) {
      setFormError("Unit name and unit code are both required.");
      return;
    }
    setSaving(true);
    setFormError("");
    try {
      const created = await createItem({ code, label, uom_type: type });
      if (!created) {
        setFormError("Could not add this unit. Check the message above and try a different name or code.");
        return;
      }
      onChange(created.code);
      setCreateOpen(false);
      toast.success(`Added ${created.label} (${created.code})`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Select
        open={selectOpen}
        onOpenChange={setSelectOpen}
        value={v}
        onValueChange={(val) => onChange(val === NONE ? "" : val)}
      >
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
          {allowCreate && (
            <div className="mt-1 border-t pt-1">
              <button
                type="button"
                data-testid={`uom-add-new-${type}`}
                className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-left text-sm text-primary hover:bg-accent"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openCreate();
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <Plus className="h-3.5 w-3.5" /> Add new unit
              </button>
            </div>
          )}
        </SelectContent>
      </Select>

      {allowCreate && (
        <Dialog open={createOpen} onOpenChange={(o) => { if (!saving) setCreateOpen(o); }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Add new unit</DialogTitle>
              <DialogDescription>
                Category: {TYPE_LABEL[type]} UOM
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor={`uom-new-label-${type}`}>Unit name *</Label>
                <Input
                  id={`uom-new-label-${type}`}
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="e.g. Bottle"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor={`uom-new-code-${type}`}>Unit code *</Label>
                <Input
                  id={`uom-new-code-${type}`}
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  placeholder="e.g. Bot"
                  className="h-9 text-sm"
                />
              </div>
              {formError && (
                <p data-testid={`uom-add-error-${type}`} className="text-xs text-destructive">{formError}</p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" size="sm" onClick={() => setCreateOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={submitCreate} disabled={saving}>
                {saving ? "Adding…" : "Add unit"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
