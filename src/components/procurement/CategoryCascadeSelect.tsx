import React, { useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useProductCategories, ProductCategory } from "@/hooks/useProductCategories";
import { Plus } from "lucide-react";

interface Props {
  level1: string;
  level2: string;
  level3: string;
  onChange: (next: { level1: string; level2: string; level3: string }) => void;
  compact?: boolean;
  showLabels?: boolean;
}

const ADD_NEW = "__add_new__";

export default function CategoryCascadeSelect({
  level1,
  level2,
  level3,
  onChange,
  compact,
  showLabels = true,
}: Props) {
  const { categories, createCategory } = useProductCategories();
  const [adding, setAdding] = useState<{ level: 1 | 2 | 3; parent_id: string | null } | null>(null);
  const [newName, setNewName] = useState("");

  const l1Items = useMemo(
    () => categories.filter((c) => c.level === 1 && c.is_active),
    [categories]
  );

  const l1Match = useMemo<ProductCategory | undefined>(
    () => l1Items.find((c) => c.name.toLowerCase() === (level1 || "").toLowerCase()),
    [l1Items, level1]
  );

  const l2Items = useMemo(
    () =>
      l1Match
        ? categories.filter((c) => c.level === 2 && c.parent_id === l1Match.id && c.is_active)
        : [],
    [categories, l1Match]
  );

  const l2Match = useMemo<ProductCategory | undefined>(
    () => l2Items.find((c) => c.name.toLowerCase() === (level2 || "").toLowerCase()),
    [l2Items, level2]
  );

  const l3Items = useMemo(
    () =>
      l2Match
        ? categories.filter((c) => c.level === 3 && c.parent_id === l2Match.id && c.is_active)
        : [],
    [categories, l2Match]
  );

  const handle = async (level: 1 | 2 | 3, value: string) => {
    if (value === ADD_NEW) {
      const parent_id =
        level === 1 ? null : level === 2 ? l1Match?.id ?? null : l2Match?.id ?? null;
      if (level !== 1 && !parent_id) return;
      setNewName("");
      setAdding({ level, parent_id });
      return;
    }
    if (level === 1) onChange({ level1: value, level2: "", level3: "" });
    if (level === 2) onChange({ level1, level2: value, level3: "" });
    if (level === 3) onChange({ level1, level2, level3: value });
  };

  const confirmAdd = async () => {
    if (!adding) return;
    const created = await createCategory({
      name: newName,
      level: adding.level,
      parent_id: adding.parent_id,
    });
    if (created) {
      if (adding.level === 1) onChange({ level1: created.name, level2: "", level3: "" });
      else if (adding.level === 2)
        onChange({ level1, level2: created.name, level3: "" });
      else onChange({ level1, level2, level3: created.name });
    }
    setAdding(null);
  };

  const triggerCls = compact ? "h-8 text-xs" : "h-9 text-sm";

  const renderSelect = (
    level: 1 | 2 | 3,
    value: string,
    items: ProductCategory[],
    disabled: boolean
  ) => (
    <Select
      value={value || undefined}
      onValueChange={(v) => handle(level, v)}
      disabled={disabled}
    >
      <SelectTrigger className={triggerCls}>
        <SelectValue placeholder={disabled ? `Pick L${level - 1} first` : `L${level}…`} />
      </SelectTrigger>
      <SelectContent className="z-[60] max-h-72">
        {value && !items.some((i) => i.name.toLowerCase() === value.toLowerCase()) && (
          <SelectItem value={value} className="italic text-muted-foreground">
            {value} (legacy)
          </SelectItem>
        )}
        {items.map((c) => (
          <SelectItem key={c.id} value={c.name}>
            {c.name}
          </SelectItem>
        ))}
        <SelectItem value={ADD_NEW} className="text-primary font-medium">
          <span className="inline-flex items-center gap-1">
            <Plus className="h-3 w-3" /> Add new L{level}…
          </span>
        </SelectItem>
      </SelectContent>
    </Select>
  );

  return (
    <>
      <div className={compact ? "grid grid-cols-3 gap-1" : "grid grid-cols-3 gap-2"}>
        <div>
          {showLabels && <Label className="text-xs">L1</Label>}
          {renderSelect(1, level1, l1Items, false)}
        </div>
        <div>
          {showLabels && <Label className="text-xs">L2</Label>}
          {renderSelect(2, level2, l2Items, !l1Match)}
        </div>
        <div>
          {showLabels && <Label className="text-xs">L3</Label>}
          {renderSelect(3, level3, l3Items, !l2Match)}
        </div>
      </div>

      <Dialog open={adding !== null} onOpenChange={(o) => !o && setAdding(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add L{adding?.level} category</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Category name"
            onKeyDown={(e) => e.key === "Enter" && confirmAdd()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(null)}>
              Cancel
            </Button>
            <Button onClick={confirmAdd} disabled={!newName.trim()}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
