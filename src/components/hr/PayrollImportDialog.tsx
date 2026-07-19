import { useRef, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  Upload, Loader2, FileText, X, Sparkles, CheckCircle2, AlertCircle, ArrowLeft, ChevronsUpDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { HREmployee } from "@/hooks/useHRData";
import { StatusPill } from "@/components/expenses/shared";

const MAX_BYTES = 15 * 1024 * 1024;
const ACCEPT =
  "image/*,application/pdf," +
  ".xlsx,.xls," +
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(((r.result as string).split(",")[1]) || "");
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

type ExtractedRow = {
  raw_name: string;
  matched_employee_id: string;
  basic_salary: number;
  days_or_hours: number;
  al_days: number;
  npl_days: number;
  confidence: "high" | "medium" | "low";
  source_hint: string;
};

type ReviewRow = ExtractedRow & { _id: string };

export type PayrollImportApplyPayload = {
  employee_id: string;
  basic_salary: number;
  days_or_hours: number;
  al_days: number;
  npl_days: number;
};

export default function PayrollImportDialog({
  open, onOpenChange, employees, onApply,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  employees: HREmployee[];
  onApply: (rows: PayrollImportApplyPayload[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [rows, setRows] = useState<ReviewRow[]>([]);

  const reset = () => {
    setStep("upload"); setFiles([]); setPreviews([]); setScanning(false); setRows([]);
  };
  const close = (o: boolean) => {
    if (scanning) return;
    if (!o) reset();
    onOpenChange(o);
  };

  const handleFiles = (selected: FileList | null) => {
    if (!selected) return;
    const arr = Array.from(selected);
    for (const f of arr) {
      if (f.size > MAX_BYTES) { toast.error(`${f.name} is too large (max 15 MB)`); return; }
    }
    setFiles(prev => [...prev, ...arr]);
    arr.forEach(f => {
      if (f.type.startsWith("image/")) {
        const r = new FileReader();
        r.onload = () => setPreviews(p => [...p, r.result as string]);
        r.readAsDataURL(f);
      } else {
        setPreviews(p => [...p, ""]);
      }
    });
  };
  const removeFile = (idx: number) => {
    setFiles(f => f.filter((_, i) => i !== idx));
    setPreviews(p => p.filter((_, i) => i !== idx));
  };

  const runExtraction = async () => {
    if (files.length === 0) return;
    setScanning(true);
    try {
      const payload = await Promise.all(files.map(async f => ({
        base64: await fileToBase64(f),
        mimeType: f.type || "application/octet-stream",
        filename: f.name,
      })));
      const empHints = employees
        .filter(e => ["active", "on_leave"].includes(e.status))
        .map(e => ({ id: e.id, first_name: e.first_name, last_name: e.last_name, employment_type: e.employment_type }));

      const { data, error } = await supabase.functions.invoke("parse-payroll-sheet", {
        body: { files: payload, employees: empHints },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Extraction failed");

      const extracted: ExtractedRow[] = Array.isArray(data.rows) ? data.rows : [];
      if (extracted.length === 0) {
        toast.warning("AI didn't find any payroll rows.");
        setScanning(false);
        return;
      }
      setRows(extracted.map((r, i) => ({ ...r, _id: `r${i}-${Date.now()}` })));
      if (Array.isArray(data.warnings)) for (const w of data.warnings) toast.warning(w);
      toast.success(`AI extracted ${extracted.length} row${extracted.length === 1 ? "" : "s"}. Review before applying.`);
      setStep("review");
    } catch (e: any) {
      toast.error("Extraction failed: " + (e?.message || e));
    } finally {
      setScanning(false);
    }
  };

  const updateRow = (id: string, patch: Partial<ReviewRow>) =>
    setRows(rs => rs.map(r => r._id === id ? { ...r, ...patch } : r));
  const removeRow = (id: string) => setRows(rs => rs.filter(r => r._id !== id));

  const applyAll = () => {
    const valid = rows.filter(r => r.matched_employee_id);
    if (valid.length === 0) {
      toast.warning("No rows are matched to an employee.");
      return;
    }
    // De-dupe by employee_id (last wins).
    const map = new Map<string, PayrollImportApplyPayload>();
    for (const r of valid) {
      map.set(r.matched_employee_id, {
        employee_id: r.matched_employee_id,
        basic_salary: r.basic_salary,
        days_or_hours: r.days_or_hours,
        al_days: r.al_days,
        npl_days: r.npl_days,
      });
    }
    onApply(Array.from(map.values()));
    toast.success(`Applied ${map.size} row${map.size === 1 ? "" : "s"} to the payroll table. Review and Save.`);
    close(false);
  };

  const matchedCount = rows.filter(r => r.matched_employee_id).length;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Import — Payroll
          </DialogTitle>
          <DialogDescription>
            {step === "upload"
              ? "Upload a payroll sheet, timesheet, or PDF/photo. AI will extract each employee's basic salary, days/hours, and leave days."
              : "Review matches and values. Values apply into the payroll table for you to save; nothing is posted automatically."}
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4 overflow-y-auto">
            <div
              onDragOver={(e) => { e.preventDefault(); if (!scanning) setDragging(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
              onDrop={(e) => {
                e.preventDefault(); setDragging(false);
                if (scanning) return;
                handleFiles(e.dataTransfer.files);
              }}
              className={
                "rounded-lg border-2 border-dashed p-6 transition-colors " +
                (dragging ? "border-primary bg-primary/5" : "border-border bg-muted/20")
              }
            >
              <div className="flex flex-col items-center gap-2 text-center">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Drop files here, or{" "}
                  <button
                    type="button"
                    className="text-primary font-medium underline underline-offset-2"
                    onClick={() => inputRef.current?.click()}
                    disabled={scanning}
                  >
                    click to browse
                  </button>
                </p>
                <p className="text-xs text-muted-foreground">Images, PDF, or Excel (.xlsx/.xls). Max 15 MB each.</p>
                <input
                  ref={inputRef} type="file" multiple accept={ACCEPT}
                  className="hidden" onChange={(e) => handleFiles(e.target.files)}
                />
              </div>
            </div>

            {files.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-72 overflow-auto">
                {files.map((f, idx) => (
                  <div key={idx} className="relative border rounded p-2 bg-muted/30">
                    <button
                      className="absolute top-1 right-1 bg-background border rounded-full p-0.5"
                      onClick={() => removeFile(idx)}
                      disabled={scanning}
                      type="button"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    {previews[idx] ? (
                      <img src={previews[idx]} alt={f.name} className="w-full h-24 object-cover rounded" />
                    ) : (
                      <div className="h-24 flex items-center justify-center text-muted-foreground">
                        <FileText className="h-8 w-8" />
                      </div>
                    )}
                    <div className="text-[11px] mt-1 truncate" title={f.name}>{f.name}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {step === "review" && (
          <div className="overflow-y-auto space-y-2">
            {rows.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                All rows removed. Go back to upload another document.
              </div>
            ) : (
              <div className="space-y-2">
                {rows.map((r, idx) => (
                  <ReviewRowCard
                    key={r._id}
                    idx={idx}
                    row={r}
                    employees={employees}
                    onChange={(patch) => updateRow(r._id, patch)}
                    onRemove={() => removeRow(r._id)}
                  />
                ))}
              </div>
            )}
            {rows.length > 0 && (
              <div className="text-xs text-muted-foreground pt-2 border-t border-border/40">
                {matchedCount} of {rows.length} row(s) matched to an employee. Unmatched rows will be skipped on apply.
              </div>
            )}
          </div>
        )}

        <DialogFooter className="mt-2">
          {step === "upload" ? (
            <>
              <Button variant="ghost" onClick={() => close(false)} disabled={scanning}>Cancel</Button>
              <Button onClick={runExtraction} disabled={scanning || files.length === 0}>
                {scanning
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Extracting…</>
                  : <><Sparkles className="h-4 w-4 mr-2" /> Extract with AI</>}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setStep("upload")}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button variant="outline" onClick={() => close(false)}>Cancel</Button>
              <Button onClick={applyAll} disabled={matchedCount === 0}>
                Apply {matchedCount} to table
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewRowCard({
  idx, row, employees, onChange, onRemove,
}: {
  idx: number;
  row: ReviewRow;
  employees: HREmployee[];
  onChange: (patch: Partial<ReviewRow>) => void;
  onRemove: () => void;
}) {
  const matched = employees.find(e => e.id === row.matched_employee_id) || null;
  const border =
    row.matched_employee_id
      ? "border-border/60 bg-muted/20"
      : "border-amber-500/40 bg-amber-500/5";

  return (
    <div className={"border rounded-lg p-3 " + border}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">Row {idx + 1}</span>
          {row.source_hint && <span className="text-[11px] text-muted-foreground">· {row.source_hint}</span>}
          <ConfidencePill confidence={row.confidence} />
          {!row.matched_employee_id && (
            <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-500">
              <AlertCircle className="h-3 w-3" /> Unmatched — pick employee
            </span>
          )}
          {row.matched_employee_id && (
            <span className="inline-flex items-center gap-1 text-[11px] text-primary">
              <CheckCircle2 className="h-3 w-3" /> Matched
            </span>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={onRemove}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
        <div className="sm:col-span-2">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Employee {row.raw_name && <span className="normal-case text-muted-foreground/80">· from doc: "{row.raw_name}"</span>}
          </Label>
          <EmployeePicker
            employees={employees}
            value={row.matched_employee_id}
            onChange={(id) => onChange({ matched_employee_id: id })}
          />
        </div>
        <NumField label="Basic salary" value={row.basic_salary} onChange={(v) => onChange({ basic_salary: v })} />
        <NumField label="Days / Hrs" value={row.days_or_hours} onChange={(v) => onChange({ days_or_hours: v })} />
        <NumField label="AL days" value={row.al_days} onChange={(v) => onChange({ al_days: v })} />
        <NumField label="NPL days" value={row.npl_days} onChange={(v) => onChange({ npl_days: v })} />
      </div>
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      <Input
        type="number" step="0.01"
        value={value || ""}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </div>
  );
}

export function EmployeePicker({
  employees, value, onChange, placeholder = "Select employee…", excludeIds,
}: {
  employees: HREmployee[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  excludeIds?: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const list = useMemo(
    () =>
      employees
        .filter(e => ["active", "on_leave"].includes(e.status))
        .filter(e => !excludeIds || !excludeIds.has(e.id))
        .sort((a, b) => `${a.last_name}, ${a.first_name}`.localeCompare(`${b.last_name}, ${b.first_name}`)),
    [employees, excludeIds],
  );
  const selected = employees.find(e => e.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="w-full justify-between font-normal h-9"
        >
          <span className="truncate">
            {selected ? `${selected.last_name}, ${selected.first_name}` : <span className="text-muted-foreground">{placeholder}</span>}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[320px]" align="start">
        <Command>
          <CommandInput placeholder="Search employee…" />
          <CommandList>
            <CommandEmpty>No employees found.</CommandEmpty>
            <CommandGroup>
              {list.map(e => (
                <CommandItem
                  key={e.id}
                  value={`${e.last_name} ${e.first_name} ${e.venue || ""} ${e.job_title || ""}`}
                  onSelect={() => { onChange(e.id); setOpen(false); }}
                >
                  <div className="flex flex-col">
                    <span className="text-sm">{e.last_name}, {e.first_name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {e.venue || "—"} · {e.job_title || "—"}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ConfidencePill({ confidence }: { confidence: "high" | "medium" | "low" }) {
  const variant = confidence === "high" ? "success" : confidence === "medium" ? "info" : "warning";
  return <StatusPill variant={variant as any} className="text-[10px] px-1.5 py-0">{confidence}</StatusPill>;
}
