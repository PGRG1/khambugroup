import React, { useMemo, useState, useEffect } from "react";
import { useProductCategories, ProductCategory } from "@/hooks/useProductCategories";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, ChevronRight, Download, Upload, Check, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { downloadCSV } from "@/utils/csvDownload";

interface CountMap {
  l1: Record<string, number>;
  l2: Record<string, number>;
  l3: Record<string, number>;
}

export default function ProductCategoriesPanel() {
  const {
    categories,
    loading,
    createCategory,
    renameCategory,
    deleteCategory,
    importFromProducts,
  } = useProductCategories();

  const [selectedL1, setSelectedL1] = useState<string | null>(null);
  const [selectedL2, setSelectedL2] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [adding, setAdding] = useState<1 | 2 | 3 | null>(null);
  const [newName, setNewName] = useState("");
  const [deleting, setDeleting] = useState<ProductCategory | null>(null);
  const [counts, setCounts] = useState<CountMap>({ l1: {}, l2: {}, l3: {} });

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("product_master")
        .select("level1_category, level2_category, level3_category");
      const c: CountMap = { l1: {}, l2: {}, l3: {} };
      (data ?? []).forEach((r: any) => {
        const l1 = (r.level1_category || "").toLowerCase().trim();
        const l2 = (r.level2_category || "").toLowerCase().trim();
        const l3 = (r.level3_category || "").toLowerCase().trim();
        if (l1) c.l1[l1] = (c.l1[l1] || 0) + 1;
        if (l1 && l2) {
          const k = `${l1}>${l2}`;
          c.l2[k] = (c.l2[k] || 0) + 1;
        }
        if (l1 && l2 && l3) {
          const k = `${l1}>${l2}>${l3}`;
          c.l3[k] = (c.l3[k] || 0) + 1;
        }
      });
      setCounts(c);
    })();
  }, [categories]);

  const l1List = useMemo(
    () => categories.filter((c) => c.level === 1).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [categories]
  );

  const selectedL1Row = useMemo(
    () => l1List.find((c) => c.id === selectedL1) ?? null,
    [l1List, selectedL1]
  );

  const l2List = useMemo(
    () =>
      selectedL1Row
        ? categories
            .filter((c) => c.level === 2 && c.parent_id === selectedL1Row.id)
            .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
        : [],
    [categories, selectedL1Row]
  );

  const selectedL2Row = useMemo(
    () => l2List.find((c) => c.id === selectedL2) ?? null,
    [l2List, selectedL2]
  );

  const l3List = useMemo(
    () =>
      selectedL2Row
        ? categories
            .filter((c) => c.level === 3 && c.parent_id === selectedL2Row.id)
            .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
        : [],
    [categories, selectedL2Row]
  );

  const startEdit = (c: ProductCategory) => {
    setEditingId(c.id);
    setEditName(c.name);
  };

  const saveEdit = async () => {
    if (editingId) await renameCategory(editingId, editName);
    setEditingId(null);
  };

  const handleAdd = async () => {
    if (!adding) return;
    const parent_id =
      adding === 1 ? null : adding === 2 ? selectedL1Row?.id ?? null : selectedL2Row?.id ?? null;
    if (adding !== 1 && !parent_id) return;
    const created = await createCategory({ name: newName, level: adding, parent_id });
    if (created) {
      if (adding === 1) setSelectedL1(created.id);
      if (adding === 2) setSelectedL2(created.id);
    }
    setNewName("");
    setAdding(null);
  };

  const countFor = (c: ProductCategory): number => {
    const lower = c.name.toLowerCase();
    if (c.level === 1) return counts.l1[lower] || 0;
    if (c.level === 2 && selectedL1Row) {
      return counts.l2[`${selectedL1Row.name.toLowerCase()}>${lower}`] || 0;
    }
    if (c.level === 3 && selectedL1Row && selectedL2Row) {
      return (
        counts.l3[
          `${selectedL1Row.name.toLowerCase()}>${selectedL2Row.name.toLowerCase()}>${lower}`
        ] || 0
      );
    }
    return 0;
  };

  const exportCsv = () => {
    const rows: { L1: string; L2: string; L3: string; products: number }[] = [];
    l1List.forEach((l1) => {
      const l2s = categories.filter((c) => c.level === 2 && c.parent_id === l1.id);
      if (l2s.length === 0) {
        rows.push({ L1: l1.name, L2: "", L3: "", products: counts.l1[l1.name.toLowerCase()] || 0 });
        return;
      }
      l2s.forEach((l2) => {
        const l3s = categories.filter((c) => c.level === 3 && c.parent_id === l2.id);
        if (l3s.length === 0) {
          rows.push({
            L1: l1.name,
            L2: l2.name,
            L3: "",
            products: counts.l2[`${l1.name.toLowerCase()}>${l2.name.toLowerCase()}`] || 0,
          });
          return;
        }
        l3s.forEach((l3) => {
          rows.push({
            L1: l1.name,
            L2: l2.name,
            L3: l3.name,
            products:
              counts.l3[
                `${l1.name.toLowerCase()}>${l2.name.toLowerCase()}>${l3.name.toLowerCase()}`
              ] || 0,
          });
        });
      });
    });
    downloadCSV(
      rows,
      [
        { key: "L1", label: "L1" },
        { key: "L2", label: "L2" },
        { key: "L3", label: "L3" },
        { key: "products", label: "Products" },
      ],
      "product_categories"
    );
  };

  const renderColumn = (
    title: string,
    level: 1 | 2 | 3,
    items: ProductCategory[],
    selectedId: string | null,
    onSelect: (id: string | null) => void,
    canAdd: boolean
  ) => (
    <div className="card-glass rounded-xl flex flex-col min-h-[420px]">
      <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-[10px] text-muted-foreground">{items.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8 px-4">
            {canAdd ? "No categories yet" : `Pick an L${level - 1} first`}
          </p>
        ) : (
          <ul className="divide-y divide-border/30">
            {items.map((c) => {
              const isSelected = selectedId === c.id;
              const isEditing = editingId === c.id;
              const cnt = countFor(c);
              return (
                <li
                  key={c.id}
                  className={`px-3 py-2 flex items-center gap-2 cursor-pointer transition-colors ${
                    isSelected ? "bg-primary/10" : "hover:bg-accent/30"
                  }`}
                  onClick={() => !isEditing && onSelect(isSelected ? null : c.id)}
                >
                  {isEditing ? (
                    <>
                      <Input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit();
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="h-7 text-sm"
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          saveEdit();
                        }}
                        className="p-1 text-primary hover:bg-primary/10 rounded"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingId(null);
                        }}
                        className="p-1 text-muted-foreground hover:bg-accent rounded"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm truncate">{c.name}</span>
                      <span className="text-[10px] text-muted-foreground">{cnt}</span>
                      {level < 3 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startEdit(c);
                        }}
                        className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleting(c);
                        }}
                        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="px-3 py-2 border-t border-border/40">
        {adding === level ? (
          <div className="flex items-center gap-1">
            <Input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={`New L${level}`}
              className="h-7 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
                if (e.key === "Escape") setAdding(null);
              }}
            />
            <Button size="sm" className="h-7 px-2" onClick={handleAdd}>
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={() => setAdding(null)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <button
            onClick={() => {
              if (!canAdd) return;
              setNewName("");
              setAdding(level);
            }}
            disabled={!canAdd}
            className="w-full text-xs text-primary hover:bg-primary/5 rounded px-2 py-1 flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="h-3 w-3" /> Add L{level}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Manage your 3-level product category tree. These dropdowns show up when editing
          products and scanning invoices.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={importFromProducts}>
            <Upload className="h-4 w-4 mr-1" /> Import from existing products
          </Button>
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {renderColumn("L1 Categories", 1, l1List, selectedL1, (id) => {
            setSelectedL1(id);
            setSelectedL2(null);
          }, true)}
          {renderColumn(
            selectedL1Row ? `L2 (in ${selectedL1Row.name})` : "L2 Categories",
            2,
            l2List,
            selectedL2,
            setSelectedL2,
            !!selectedL1Row
          )}
          {renderColumn(
            selectedL2Row ? `L3 (in ${selectedL2Row.name})` : "L3 Categories",
            3,
            l3List,
            null,
            () => {},
            !!selectedL2Row
          )}
        </div>
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleting?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will also remove every child category beneath it. Existing products keep
              their text values but will no longer match this tree.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deleting) await deleteCategory(deleting.id);
                setDeleting(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
