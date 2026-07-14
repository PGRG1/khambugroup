import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  lineItemName: string;
  year: number;
  month: number;
  currentValue: number;
  onSaved: () => void;
}

const fmt = (n: number) => {
  if (n === 0) return "—";
  const abs = Math.abs(n).toLocaleString("en-HK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `(${abs})` : abs;
};

export function PLInlineCell({ lineItemName, year, month, currentValue, onSaved }: Props) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setVal(currentValue === 0 ? "" : String(currentValue));
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [editing, currentValue]);

  const save = async () => {
    const newAmount = Number(val) || 0;
    if (newAmount === currentValue) {
      setEditing(false);
      return;
    }

    // Check if a row exists
    const { data: existing } = await supabase
      .from("pl_manual_lines")
      .select("id, amount")
      .eq("year", year)
      .eq("month", month)
      .eq("line_item_name", lineItemName)
      .limit(1);

    if (existing && existing.length > 0) {
      const { error } = await supabase
        .from("pl_manual_lines")
        .update({ amount: newAmount })
        .eq("id", existing[0].id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase
        .from("pl_manual_lines")
        .insert({ year, month, line_item_name: lineItemName, amount: newAmount, notes: "" });
      if (error) { toast.error(error.message); return; }
    }

    setEditing(false);
    onSaved();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); save(); }
    if (e.key === "Escape") setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        className="w-full bg-transparent border-b border-primary/40 outline-none text-right font-mono text-sm tabular-nums px-1 py-0.5"
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={save}
      />
    );
  }

  const isNeg = currentValue < 0;
  return (
    <span
      className={`cursor-pointer hover:bg-accent/30 rounded px-1 py-0.5 transition-colors font-mono text-sm tabular-nums block text-right ${isNeg ? "text-destructive" : ""}`}
      onClick={() => setEditing(true)}
      title="Click to edit"
    >
      {fmt(currentValue)}
    </span>
  );
}
