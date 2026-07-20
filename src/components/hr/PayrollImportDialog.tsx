import { useRef, useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger, PopoverAnchor } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Upload, Loader2, FileText, X, Sparkles, CheckCircle2, AlertCircle, ArrowLeft, ChevronsUpDown, UserPlus,
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
  base_salary: number;
  gross_pay: number;
  mpf_employee: number;
  mpf_employer: number;
  other_deductions: number;
  net_pay: number;
  expected_net?: number;
  reconciles?: boolean;
  computed_adjustment?: number;
  confidence: "high" | "medium" | "low";
  source_hint: string;
};

type ReviewRow = ExtractedRow & { _id: string };

export type PayrollImportApplyPayload = {
  employee_id: string;
  year: number;
  month: number;
  base_salary: number;
  gross_pay: number;
  mpf_employee: number;
  mpf_employer: number;
  other_deductions: number;
  net_pay: number;
};


type SimpleDept = { id: string; name: string; is_active: boolean };
type SimpleVenue = { id: string; name: string; is_active: boolean };

/** Parse "LAST, First (Nick)" → first / last (title-cased). */
export function splitDocName(raw: string): { first: string; last: string } {
  if (!raw) return { first: "", last: "" };
  const trimmed = raw.trim();
  const commaIdx = trimmed.indexOf(",");
  if (commaIdx > 0) {
    const lastRaw = trimmed.slice(0, commaIdx).trim();
    const firstRaw = trimmed.slice(commaIdx + 1).trim();
    const last = lastRaw
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
    return { first: firstRaw, last };
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
  return { first: trimmed, last: "" };
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Simple token-overlap similarity (0..1) — case-insensitive. */
function nameSimilarity(a: string, b: string): number {
  const at = new Set(normalizeName(a).split(" ").filter(Boolean));
  const bt = new Set(normalizeName(b).split(" ").filter(Boolean));
  if (at.size === 0 || bt.size === 0) return 0;
  let hit = 0;
  at.forEach((t) => { if (bt.has(t)) hit += 1; });
  return hit / Math.max(at.size, bt.size);
}

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export default function PayrollImportDialog({
  open, onOpenChange, employees, onApply, onCreateEmployee, departments, venues,
  targetYear, targetMonth,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  employees: HREmployee[];
  onApply: (rows: PayrollImportApplyPayload[]) => void;
  onCreateEmployee: (emp: Partial<HREmployee>) => Promise<HREmployee | null>;
  departments: SimpleDept[];
  venues: SimpleVenue[];
  targetYear: number;
  targetMonth: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [periodYear, setPeriodYear] = useState<number>(targetYear);
  const [periodMonth, setPeriodMonth] = useState<number>(targetMonth);

  // Re-sync when caller opens the dialog for a different period.
  useMemo(() => { if (open) { setPeriodYear(targetYear); setPeriodMonth(targetMonth); } return null; }, [open, targetYear, targetMonth]);

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
      // Pre-fill gross_pay when the sheet didn't print one, using base + implied adjustment
      // so the Gross column is never blank.
      const withDefaults = extracted.map((r, i) => {
        const grossFallback = r.gross_pay > 0
          ? r.gross_pay
          : Number((r.base_salary + (r.computed_adjustment ?? 0)).toFixed(2));
        return { ...r, gross_pay: grossFallback, _id: `r${i}-${Date.now()}` };
      });
      setRows(withDefaults);
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
    const map = new Map<string, PayrollImportApplyPayload>();
    for (const r of valid) {
      map.set(r.matched_employee_id, {
        employee_id: r.matched_employee_id,
        base_salary: r.base_salary,
        gross_pay: r.gross_pay,
        mpf_employee: r.mpf_employee,
        mpf_employer: r.mpf_employer,
        other_deductions: r.other_deductions || 0,
        net_pay: r.net_pay,
      });
    }
    onApply(Array.from(map.values()));
    toast.success(`Applied ${map.size} row${map.size === 1 ? "" : "s"} to the payroll table. Review and Save.`);
    close(false);
  };


  const matchedCount = rows.filter(r => r.matched_employee_id).length;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Import — Payroll
          </DialogTitle>
          <DialogDescription>
            {step === "upload"
              ? "Upload a payroll sheet, PDF, or photo. AI reads the final figures — Base, MPF, and Net — straight off the document, exactly as printed."
              : "Review the scanned figures. They apply into the payroll table as-is; nothing is recalculated or posted automatically."}
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
              <ReviewTable
                rows={rows}
                employees={employees}
                departments={departments}
                venues={venues}
                onCreateEmployee={onCreateEmployee}
                onChangeRow={updateRow}
                onRemoveRow={removeRow}
              />
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

function ReviewTable({
  rows, employees, departments, venues, onCreateEmployee, onChangeRow, onRemoveRow,
}: {
  rows: ReviewRow[];
  employees: HREmployee[];
  departments: SimpleDept[];
  venues: SimpleVenue[];
  onCreateEmployee: (emp: Partial<HREmployee>) => Promise<HREmployee | null>;
  onChangeRow: (id: string, patch: Partial<ReviewRow>) => void;
  onRemoveRow: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto border border-border/50 rounded-md">
      <table className="w-full text-[12px] tabular-nums">
        <thead className="bg-muted/40 text-muted-foreground uppercase tracking-wider text-[10px]">
          <tr className="border-b border-border/50">
            <th className="w-8 px-2 py-2 text-left"></th>
            <th className="px-2 py-2 text-left min-w-[220px]">Employee</th>
            <th className="px-2 py-2 text-right w-[92px]">Base</th>
            <th className="px-2 py-2 text-right w-[92px]">Gross</th>
            <th className="px-2 py-2 text-right w-[92px]">MPF (EE)</th>
            <th className="px-2 py-2 text-right w-[92px]">MPF (ER)</th>
            <th className="px-2 py-2 text-right w-[92px]">Other Ded.</th>
            <th className="px-2 py-2 text-right w-[92px]">Net</th>
            <th className="px-2 py-2 text-right w-[110px]">Reconcile</th>
            <th className="w-8 px-1 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <ReviewTableRow
              key={r._id}
              row={r}
              employees={employees}
              departments={departments}
              venues={venues}
              onCreateEmployee={onCreateEmployee}
              onChange={(patch) => onChangeRow(r._id, patch)}
              onRemove={() => onRemoveRow(r._id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReviewTableRow({
  row, employees, departments, venues, onChange, onRemove, onCreateEmployee,
}: {
  row: ReviewRow;
  employees: HREmployee[];
  departments: SimpleDept[];
  venues: SimpleVenue[];
  onChange: (patch: Partial<ReviewRow>) => void;
  onRemove: () => void;
  onCreateEmployee: (emp: Partial<HREmployee>) => Promise<HREmployee | null>;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const selected = employees.find((e) => e.id === row.matched_employee_id);
  const matched = !!row.matched_employee_id;

  const gross = row.gross_pay > 0 ? row.gross_pay : row.base_salary;
  const expected = gross - row.mpf_employee - (row.other_deductions || 0);
  const diff = row.net_pay - expected;
  const ties = row.net_pay > 0 && Math.abs(diff) < 1;

  const rowTint = matched ? "hover:bg-muted/30" : "bg-amber-500/[0.06] hover:bg-amber-500/[0.1]";

  return (
    <tr className={"border-b border-border/40 last:border-b-0 " + rowTint}>
      <td className="px-2 py-1.5 align-middle">
        {matched ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
        )}
      </td>
      <td className="px-2 py-1.5 align-middle">
        <Popover open={createOpen} onOpenChange={setCreateOpen}>
          <PopoverAnchor asChild>
            <div>
              <EmployeePicker
                employees={employees}
                value={row.matched_employee_id}
                onChange={(id) => onChange({ matched_employee_id: id })}
                onRequestCreate={() => setCreateOpen(true)}
                compact
              />
            </div>
          </PopoverAnchor>
          <PopoverContent className="w-[360px] p-0" align="start" side="bottom">
            <InlineCreateEmployee
              rawName={row.raw_name}
              employees={employees}
              departments={departments}
              venues={venues}
              onCancel={() => setCreateOpen(false)}
              onPickExisting={(id) => { onChange({ matched_employee_id: id }); setCreateOpen(false); }}
              onCreate={async (payload) => {
                const created = await onCreateEmployee(payload);
                if (created) {
                  onChange({ matched_employee_id: created.id });
                  setCreateOpen(false);
                  toast.success(`Created ${created.first_name} ${created.last_name}${created.employee_code ? ` (${created.employee_code})` : ""}`);
                }
              }}
            />
          </PopoverContent>
        </Popover>
        <div className="mt-0.5 text-[10.5px] text-muted-foreground truncate">
          {matched
            ? (selected?.employee_code
                ? <span className="font-mono">{selected.employee_code}</span>
                : <span className="italic">no code</span>)
            : (row.raw_name
                ? <span>from doc: <span className="text-foreground/70">{row.raw_name}</span></span>
                : <span>—</span>)}
        </div>
      </td>
      <TableNumCell value={row.base_salary} onChange={(v) => onChange({ base_salary: v })} />
      <TableNumCell value={row.gross_pay} onChange={(v) => onChange({ gross_pay: v })} />
      <TableNumCell value={row.mpf_employee} onChange={(v) => onChange({ mpf_employee: v })} />
      <TableNumCell value={row.mpf_employer} onChange={(v) => onChange({ mpf_employer: v })} />
      <TableNumCell value={row.other_deductions || 0} onChange={(v) => onChange({ other_deductions: v })} />
      <TableNumCell value={row.net_pay} onChange={(v) => onChange({ net_pay: v })} />
      <td className="px-2 py-1.5 align-middle text-right">
        {row.net_pay <= 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : ties ? (
          <CheckCircle2 className="inline h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <span
            className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-500"
            title="Doesn't tie to Net — applied as-is, gap shows in Adjustments"
          >
            <AlertCircle className="h-3 w-3" />
            {diff > 0 ? "+" : "−"}
            {Math.abs(diff).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        )}
      </td>
      <td className="px-1 py-1.5 align-middle text-right">
        <Button size="sm" variant="ghost" onClick={onRemove} className="h-6 w-6 p-0">
          <X className="h-3.5 w-3.5" />
        </Button>
      </td>
    </tr>
  );
}

function TableNumCell({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <td className="px-1 py-1 align-middle">
      <Input
        type="number"
        step="0.01"
        value={value || ""}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="h-7 px-1.5 text-right text-[12px] tabular-nums"
      />
    </td>
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
  employees, value, onChange, placeholder = "Select employee…", excludeIds, onRequestCreate, compact,
}: {
  employees: HREmployee[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  excludeIds?: Set<string>;
  onRequestCreate?: () => void;
  compact?: boolean;
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
          className={"w-full justify-between font-normal " + (compact ? "h-8 text-[12px] px-2" : "h-9")}
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
            {onRequestCreate && (
              <>
                <CommandGroup>
                  <CommandItem
                    value="__add_new__"
                    onSelect={() => { setOpen(false); onRequestCreate(); }}
                    className="text-primary"
                  >
                    <UserPlus className="h-3.5 w-3.5 mr-2" /> Add new employee
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
            <CommandEmpty>No employees found.</CommandEmpty>
            <CommandGroup>
              {list.map(e => (
                <CommandItem
                  key={e.id}
                  value={`${e.last_name} ${e.first_name} ${e.venue || ""} ${e.job_title || ""}`}
                  onSelect={() => { onChange(e.id); setOpen(false); }}
                >
                  <div className="flex flex-col">
                    <span className="text-sm">
                      {e.last_name}, {e.first_name}
                      {e.employee_code && <span className="ml-2 font-mono text-[10px] text-muted-foreground">{e.employee_code}</span>}
                    </span>
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

/* ── Inline create employee form ─────────────────────────────── */

function InlineCreateEmployee({
  rawName, employees, departments, venues, onCancel, onCreate, onPickExisting,
}: {
  rawName: string;
  employees: HREmployee[];
  departments: SimpleDept[];
  venues: SimpleVenue[];
  onCancel: () => void;
  onCreate: (emp: Partial<HREmployee>) => Promise<void>;
  onPickExisting: (id: string) => void;
}) {
  const guess = useMemo(() => splitDocName(rawName), [rawName]);
  const [firstName, setFirstName] = useState(guess.first);
  const [lastName, setLastName] = useState(guess.last);
  const [jobTitle, setJobTitle] = useState("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [venueId, setVenueId] = useState<string>("");
  const [employmentType, setEmploymentType] = useState("full_time");
  const [saving, setSaving] = useState(false);
  const [dupAcknowledged, setDupAcknowledged] = useState(false);

  const fullName = `${firstName} ${lastName}`.trim();
  const dup = useMemo(() => {
    if (!fullName) return null;
    let best: { emp: HREmployee; score: number } | null = null;
    for (const e of employees) {
      const s = Math.max(
        nameSimilarity(fullName, `${e.first_name} ${e.last_name}`),
        nameSimilarity(rawName || "", `${e.last_name}, ${e.first_name}`),
      );
      if (!best || s > best.score) best = { emp: e, score: s };
    }
    return best && best.score >= 0.6 ? best.emp : null;
  }, [employees, fullName, rawName]);

  const canCreate = firstName.trim().length > 0 && lastName.trim().length > 0 && (!dup || dupAcknowledged);

  const submit = async () => {
    if (!canCreate) return;
    setSaving(true);
    try {
      await onCreate({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        job_title: jobTitle.trim() || null,
        department_id: departmentId || null,
        venue_id: venueId || null,
        employment_type: employmentType,
        status: "active",
        hire_date: new Date().toISOString().split("T")[0],
      } as any);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2 rounded-md border border-primary/40 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.12em] font-semibold text-primary">Add new employee</span>
        <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {dup && !dupAcknowledged && (
        <div className="text-[11px] rounded bg-amber-500/10 border border-amber-500/30 p-2 text-amber-700 dark:text-amber-400">
          Similar name already exists: <span className="font-medium">{dup.first_name} {dup.last_name}</span>
          {dup.employee_code && <span className="font-mono ml-1">({dup.employee_code})</span>} — is this the same person?
          <div className="mt-1.5 flex gap-2">
            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => onPickExisting(dup.id)}>
              Use this employee instead
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setDupAcknowledged(true)}>
              No, create new
            </Button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">First name *</Label>
          <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="h-8" />
        </div>
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Last name *</Label>
          <Input value={lastName} onChange={(e) => setLastName(e.target.value)} className="h-8" />
        </div>
        <div className="col-span-2">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Job title</Label>
          <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className="h-8" />
        </div>
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Department</Label>
          <Select value={departmentId} onValueChange={setDepartmentId}>
            <SelectTrigger className="h-8"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              {departments.filter(d => d.is_active).map(d => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Venue</Label>
          <Select value={venueId} onValueChange={setVenueId}>
            <SelectTrigger className="h-8"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              {venues.filter(v => v.is_active).map(v => (
                <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Employment type</Label>
          <Select value={employmentType} onValueChange={setEmploymentType}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="full_time">Full time</SelectItem>
              <SelectItem value="part_time">Part time</SelectItem>
              <SelectItem value="casual">Casual</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button size="sm" onClick={submit} disabled={!canCreate || saving}>
          {saving ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Creating…</> : "Create employee"}
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">Employee ID is assigned automatically on create.</p>
    </div>
  );
}
