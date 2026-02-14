import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface Props {
  year: number;
  months: number[];
  onAdded: () => void;
}

export function PLAddLineItem({ year, months, onAdded }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  const handleAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed) { toast.error("Enter a line item name"); return; }

    // Insert a row for each selected month with 0 amount
    const rows = months.map(m => ({
      year,
      month: m,
      line_item_name: trimmed,
      amount: 0,
      notes: "",
    }));

    const { error } = await supabase.from("pl_manual_lines").insert(rows);
    if (error) { toast.error(error.message); return; }

    toast.success(`Added "${trimmed}"`);
    setName("");
    setOpen(false);
    onAdded();
  };

  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1" onClick={() => { setOpen(true); setTimeout(() => ref.current?.focus(), 0); }}>
        <Plus className="h-3 w-3" /> Add line item
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2 py-1 px-6">
      <Input
        ref={ref}
        placeholder="Line item name…"
        className="h-7 text-sm w-48"
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setOpen(false); }}
      />
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleAdd}>Add</Button>
      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen(false)}>Cancel</Button>
    </div>
  );
}
