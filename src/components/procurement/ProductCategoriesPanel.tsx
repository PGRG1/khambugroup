import React, { useMemo, useState, useEffect } from "react";
import { useProductCategories, ProductCategory } from "@/hooks/useProductCategories";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, ChevronRight, ChevronDown, Download, Upload, Check, X } from "lucide-react";
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

  const [expandedL1, setExpandedL1] = useState<Set<string>>(new Set());
  const [expandedL2, setExpandedL2] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [adding, setAdding] = useState<{ level: 1 | 2 | 3; parentId: string | null } | null>(null);
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
        if (l1 && l2) c.l2[`${l1}>${l2}`] = (c.l2[`${l1}>${l2}`] || 0) + 1;
        if (l1 && l2 && l3) c.l3[`${l1}>${l2}>${l3}`] = (c.l3[`${l1}>${l2}>${l3}`] || 0) + 1;
      });
      setCounts(c);
    })();
  }, [categories]);

  const byLevel = useMemo(() => {
    const sort = (a: ProductCategory, b: ProductCategory) => a.sort_order - b.sort_order || a.name.localeCompare(b.name);
    return {
      l1: categories.filter(c => c.level === 1).sort(sort),
      childrenOf: (parentId: string) => categories.filter(c => c.parent_id === parentId).sort(sort),
    };
  }, [categories]);

  const startEdit = (c: ProductCategory) => { setEditingId(c.id); setEditName(c.name); };
  const saveEdit = async () => { if (editingId) await renameCategory(editingId, editName); setEditingId(null); };

  const openAdd = (level: 1 | 2 | 3, parentId: string | null) => {
    setAdding({ level, parentId });
    setNewName("");
  };

  const handleAdd = async () => {
    if (!adding) return;
    const created = await createCategory({ name: newName, level: adding.level, parent_id: adding.parentId });
    if (created) {
      if (adding.level === 2 && adding.parentId) setExpandedL1(prev => new Set(prev).add(adding.parentId!));
      if (adding.level === 3 && adding.parentId) setExpandedL2(prev => new Set(prev).add(adding.parentId!));
    }
    setAdding(null);
    setNewName("");
  };

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setter(next);
  };

  const countL1 = (c: ProductCategory) => counts.l1[c.name.toLowerCase()] || 0;
  const countL2 = (l1: ProductCategory, l2: ProductCategory) =>
    counts.l2[`${l1.name.toLowerCase()}>${l2.name.toLowerCase()}`] || 0;
  const countL3 = (l1: ProductCategory, l2: ProductCategory, l3: ProductCategory) =>
    counts.l3[`${l1.name.toLowerCase()}>${l2.name.toLowerCase()}>${l3.name.toLowerCase()}`] || 0;

  const exportCsv = () => {
    const rows: { L1: string; L2: string; L3: string; products: number }[] = [];
    byLevel.l1.forEach(l1 => {
      const l2s = byLevel.childrenOf(l1.id);
      if (l2s.length === 0) { rows.push({ L1: l1.name, L2: "", L3: "", products: countL1(l1) }); return; }
      l2s.forEach(l2 => {
        const l3s = byLevel.childrenOf(l2.id);
        if (l3s.length === 0) { rows.push({ L1: l1.name, L2: l2.name, L3: "", products: countL2(l1, l2) }); return; }
        l3s.forEach(l3 => rows.push({ L1: l1.name, L2: l2.name, L3: l3.name, products: countL3(l1, l2, l3) }));
      });
    });
    downloadCSV(rows, [
      { key: "L1", label: "L1" }, { key: "L2", label: "L2" }, { key: "L3", label: "L3" },
      { key: "products", label: "Bills & Invoices" },
    ], "product_categories");
  };

  const renderRow = (
    c: ProductCategory,
    level: 1 | 2 | 3,
    count: number,
    opts: { expanded?: boolean; onToggle?: () => void; hasChildren?: boolean; onAddChild?: () => void; addChildLabel?: string },
  ) => {
    const isEditing = editingId === c.id;
    const indent = level === 1 ? "pl-3" : level === 2 ? "pl-9" : "pl-16";
    return (
      <div
        key={c.id}
        className={`${indent} pr-2 flex items-center gap-2 min-h-[44px] border-b border-border/40 hover:bg-accent/20 transition-colors`}
      >
        {opts.hasChildren ? (
          <button onClick={opts.onToggle} className="p-1 -ml-1 rounded hover:bg-accent shrink-0" aria-label={opts.expanded ? "Collapse" : "Expand"}>
            {opts.expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
        ) : (
          <span className="w-[22px] shrink-0" />
        )}
        {isEditing ? (
          <>
            <Input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditingId(null); }}
              className="h-8 text-sm flex-1" />
            <button onClick={saveEdit} className="p-1.5 text-primary hover:bg-primary/10 rounded"><Check className="h-3.5 w-3.5" /></button>
            <button onClick={() => setEditingId(null)} className="p-1.5 text-muted-foreground hover:bg-accent rounded"><X className="h-3.5 w-3.5" /></button>
          </>
        ) : (
          <>
            <span className={`flex-1 truncate ${level === 1 ? "font-semibold text-sm" : level === 2 ? "text-sm" : "text-xs text-muted-foreground"}`}>
              {c.name}
            </span>
            <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{count}</span>
            {opts.onAddChild && (
              <button onClick={opts.onAddChild}
                className="p-1.5 rounded hover:bg-primary/10 text-primary opacity-60 hover:opacity-100"
                title={opts.addChildLabel}>
                <Plus className="h-3 w-3" />
              </button>
            )}
            <button onClick={() => startEdit(c)} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"><Pencil className="h-3 w-3" /></button>
            <button onClick={() => setDeleting(c)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
          </>
        )}
      </div>
    );
  };

  const renderAddInline = (level: 1 | 2 | 3, parentId: string | null) => {
    if (!adding || adding.level !== level || adding.parentId !== parentId) return null;
    const indent = level === 1 ? "pl-3" : level === 2 ? "pl-9" : "pl-16";
    return (
      <div className={`${indent} pr-2 py-2 flex items-center gap-2 border-b border-border/40 bg-primary/5`}>
        <span className="w-[22px] shrink-0" />
        <Input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setAdding(null); }}
          placeholder={`New L${level} category`} className="h-8 text-sm flex-1" />
        <Button size="sm" className="h-8 px-2" onClick={handleAdd} disabled={!newName.trim()}><Check className="h-3.5 w-3.5" /></Button>
        <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setAdding(null)}><X className="h-3.5 w-3.5" /></Button>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground max-w-2xl">
          Manage your 3-level bill & invoice category tree. These dropdowns show up when editing bills & invoices and scanning invoices.
        </p>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={importFromProducts} className="min-h-[36px]">
            <Upload className="h-4 w-4 mr-1" /> Import
          </Button>
          <Button size="sm" variant="outline" onClick={exportCsv} className="min-h-[36px]">
            <Download className="h-4 w-4 mr-1" /> Export CSV
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-border bg-card p-3 space-y-2">
          {[0,1,2,3,4].map(i => <div key={i} className="h-11 bg-muted/40 rounded animate-pulse" />)}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-3 py-2 border-b border-border/60 bg-muted/20 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Category Tree</h3>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-primary" onClick={() => openAdd(1, null)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add L1
            </Button>
          </div>
          {renderAddInline(1, null)}
          {byLevel.l1.length === 0 && !adding && (
            <p className="text-xs text-muted-foreground text-center py-8">No categories yet — click "Add L1" to start.</p>
          )}
          {byLevel.l1.map(l1 => {
            const l2s = byLevel.childrenOf(l1.id);
            const isExpanded = expandedL1.has(l1.id);
            return (
              <React.Fragment key={l1.id}>
                {renderRow(l1, 1, countL1(l1), {
                  expanded: isExpanded,
                  onToggle: () => toggle(expandedL1, setExpandedL1, l1.id),
                  hasChildren: l2s.length > 0 || adding?.parentId === l1.id,
                  onAddChild: () => { setExpandedL1(prev => new Set(prev).add(l1.id)); openAdd(2, l1.id); },
                  addChildLabel: "Add L2",
                })}
                {(isExpanded || adding?.parentId === l1.id) && (
                  <>
                    {renderAddInline(2, l1.id)}
                    {l2s.map(l2 => {
                      const l3s = byLevel.childrenOf(l2.id);
                      const l2Expanded = expandedL2.has(l2.id);
                      return (
                        <React.Fragment key={l2.id}>
                          {renderRow(l2, 2, countL2(l1, l2), {
                            expanded: l2Expanded,
                            onToggle: () => toggle(expandedL2, setExpandedL2, l2.id),
                            hasChildren: l3s.length > 0 || adding?.parentId === l2.id,
                            onAddChild: () => { setExpandedL2(prev => new Set(prev).add(l2.id)); openAdd(3, l2.id); },
                            addChildLabel: "Add L3",
                          })}
                          {(l2Expanded || adding?.parentId === l2.id) && (
                            <>
                              {renderAddInline(3, l2.id)}
                              {l3s.map(l3 => renderRow(l3, 3, countL3(l1, l2, l3), {}))}
                            </>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </>
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleting?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will also remove every child category beneath it. Existing products keep their text values but will no longer match this tree.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { if (deleting) await deleteCategory(deleting.id); setDeleting(null); }}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
