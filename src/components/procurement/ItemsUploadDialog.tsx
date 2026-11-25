import { useRef, useState } from "react";
import readXlsxFile, { readSheetNames } from "read-excel-file";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { parseItemsSheet, type ImportRow } from "@/utils/itemsImport";
import { toast } from "sonner";

type RowResult = { row: number; result: "new" | "update" | "problem"; name: string; supplier: string; problems: string[] };
type Check = { applied: boolean; rows: RowResult[]; new: number; update: number; problem: number; batch?: string; supplier_rows?: number };

const TEMPLATE_URL = "/templates/bani-items-upload-template.xlsx";
const MAX_BYTES = 10 * 1024 * 1024;

/** Items Master upload: read the template, let the server check every row, then import all rows in one step (approvers only). */
export function ItemsUploadDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void | Promise<void> }) {
  const { tenantId } = useActiveTenant();
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [check, setCheck] = useState<Check | null>(null);
  const [busy, setBusy] = useState<"" | "reading" | "checking" | "importing" | "undoing">("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<Check | null>(null);

  const reset = () => { setFileName(""); setRows(null); setCheck(null); setError(""); setDone(null); if (input.current) input.current.value = ""; };
  const close = (o: boolean) => { if (busy) return; if (!o) reset(); onOpenChange(o); };

  const run = async (data: ImportRow[], apply: boolean) => {
    if (!tenantId) return null;
    const { data: res, error: err } = await (supabase.rpc as any)("import_items", { p_tenant: tenantId, p_rows: data, p_apply: apply, p_file_name: fileName });
    if (err) { setError(err.message || "Couldn't check the file."); return null; }
    return res as Check;
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    reset();
    if (!/\.xlsx$/i.test(file.name)) { setError("Upload the .xlsx template."); return; }
    if (file.size > MAX_BYTES) { setError("The file is over 10 MB."); return; }
    setFileName(file.name); setBusy("reading");
    try {
      const names = await readSheetNames(file);
      const sheet = names.find(n => n.trim().toLowerCase() === "items") ?? names[0];
      const data = await readXlsxFile(file, { sheet });
      const parsed = parseItemsSheet(data as unknown[][]);
      if (parsed.error) { setError(parsed.error); return; }
      setRows(parsed.rows);
      setBusy("checking");
      const res = await run(parsed.rows, false);
      if (res) setCheck(res);
    } catch {
      setError("Couldn't read this file. Save it as .xlsx and try again.");
    } finally { setBusy(""); }
  };

  const importAll = async () => {
    if (!rows || !check || check.problem) return;
    setBusy("importing");
    const res = await run(rows, true);
    setBusy("");
    if (!res) return;
    if (!res.applied) { setCheck(res); return; }
    setDone(res);
    await onDone();
  };

  const undo = async () => {
    if (!done?.batch) return;
    setBusy("undoing");
    const { error: err } = await (supabase.rpc as any)("undo_item_import", { p_batch: done.batch });
    setBusy("");
    if (err) { toast.error(err.message); return; }
    toast.success("Upload undone");
    await onDone();
    close(false);
  };

  const problems = check?.rows.filter(r => r.result === "problem") ?? [];

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Upload items</DialogTitle>
          <DialogDescription>One row per item per supplier. Bani checks every row before anything is saved.</DialogDescription>
        </DialogHeader>
        {done ? (
          <div className="space-y-3 text-[13px]">
            <p className="font-medium">Done: {done.new} added, {done.update} updated, {done.supplier_rows} supplier rows.</p>
            <div className="flex gap-2">
              <Button onClick={() => close(false)}>Close</Button>
              <Button variant="outline" disabled={!!busy} onClick={undo}>{busy === "undoing" ? "Undoing…" : "Undo"}</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-[13px]">
            <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={e => void pick(e.target.files?.[0])} />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" disabled={!!busy} onClick={() => input.current?.click()}>{fileName ? "Choose another file" : "Choose file"}</Button>
              <a href={TEMPLATE_URL} download className="text-[13px] underline underline-offset-4">Download template</a>
            </div>
            {fileName && <p className="truncate text-muted-foreground" title={fileName}>{fileName}</p>}
            {busy === "reading" && <p className="text-muted-foreground">Reading the file…</p>}
            {busy === "checking" && <p className="text-muted-foreground">Checking {rows?.length.toLocaleString()} rows…</p>}
            {error && <p className="text-destructive">{error}</p>}
            {check && !busy && (
              <>
                <p className="tabular-nums">
                  {check.new.toLocaleString()} new items · {check.update.toLocaleString()} updates
                  {check.problem > 0 && <span className="text-[hsl(var(--warning))]"> · {check.problem.toLocaleString()} rows need fixing</span>}
                </p>
                {problems.length > 0 && (
                  <div className="max-h-[260px] overflow-y-auto border-y border-border">
                    {problems.slice(0, 200).map(p => (
                      <div key={p.row} className="flex gap-3 border-b border-border/60 py-2 last:border-0">
                        <span className="w-14 shrink-0 tabular-nums text-muted-foreground">Row {p.row}</span>
                        <span className="min-w-0"><span className="block truncate font-medium" title={p.name}>{p.name || "No name"}</span><span className="block text-[hsl(var(--warning))]">{p.problems.join(" · ")}</span></span>
                      </div>
                    ))}
                    {problems.length > 200 && <p className="py-2 text-muted-foreground">…and {(problems.length - 200).toLocaleString()} more</p>}
                  </div>
                )}
                {problems.length > 0
                  ? <p className="text-muted-foreground">Fix these rows in the file and upload it again. Nothing has been saved.</p>
                  : <Button disabled={!!busy} onClick={importAll}>Import {rows?.length.toLocaleString()} rows</Button>}
              </>
            )}
            {busy === "importing" && <p className="text-muted-foreground">Importing…</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
