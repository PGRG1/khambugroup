import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ScanLine, Receipt, FileSpreadsheet, TrendingUp, Landmark, FileSignature,
  Users, Wallet, FilePlus, Eye, FolderOpen,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useInvoiceData } from "@/hooks/useInvoiceData";
import AttachmentViewerDialog from "@/components/invoices/AttachmentViewerDialog";

type DocType =
  | "daily_sales" | "invoice" | "settlement" | "bank_statement"
  | "contract" | "payroll" | "petty_cash" | "other";

const DOC_TYPES: { key: DocType; label: string; icon: any; description: string }[] = [
  { key: "daily_sales", label: "Daily Sales / EOD Report", icon: Receipt, description: "Scan end-of-day sales reports" },
  { key: "invoice", label: "Invoice / Bill", icon: FileSpreadsheet, description: "Scan supplier invoices and bills" },
  { key: "settlement", label: "Payment Processor / Settlement Statement", icon: TrendingUp, description: "Settlement statements" },
  { key: "bank_statement", label: "Bank Statement", icon: Landmark, description: "Monthly bank statements" },
  { key: "contract", label: "Contract / Agreement", icon: FileSignature, description: "Legal contracts & agreements" },
  { key: "payroll", label: "Payroll File", icon: Users, description: "Payroll runs & payslips" },
  { key: "petty_cash", label: "Petty Cash Receipt", icon: Wallet, description: "Petty cash receipts" },
  { key: "other", label: "Other", icon: FilePlus, description: "Any other document" },
];

export default function DocumentCentre() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { invoices, suppliers } = useInvoiceData();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState("");
  const [viewerTitle, setViewerTitle] = useState("");

  const handlePick = (type: DocType) => {
    setPickerOpen(false);
    if (type === "daily_sales") navigate("/?scan=1");
    else if (type === "invoice") navigate("/procurement/invoices?scan=1");
    else if (type === "settlement") navigate("/finance/payments-settlements");
    else toast({ title: "Coming soon", description: `${DOC_TYPES.find(t => t.key === type)?.label} workflow is not yet available.` });
  };

  const supplierMap = useMemo(() => {
    const m = new Map<string, string>();
    (suppliers || []).forEach((s: any) => m.set(s.id, s.name));
    return m;
  }, [suppliers]);

  const docs = useMemo(() => {
    return (invoices || [])
      .filter((inv: any) => inv.file_url || inv.file_name)
      .map((inv: any) => ({
        id: inv.id,
        file_name: inv.file_name || "—",
        doc_type: "Invoice / Bill",
        source: "Invoice scanner",
        linked_label: `${supplierMap.get(inv.supplier_id) || "Unknown"} · #${inv.invoice_number}`,
        status: inv.status,
        uploaded_at: inv.created_at,
        file_url: inv.file_url,
      }))
      .sort((a, b) => (a.uploaded_at < b.uploaded_at ? 1 : -1));
  }, [invoices, supplierMap]);

  const openAttachment = (url: string, title: string) => {
    setViewerUrl(url);
    setViewerTitle(title);
    setViewerOpen(true);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-semibold tracking-tight flex items-center gap-2">
            <FolderOpen className="h-6 w-6 text-primary" /> Document Centre
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Central entry point for scanning and uploading business documents.
          </p>
        </div>
        <Button onClick={() => setPickerOpen(true)} size="lg" className="gap-2">
          <ScanLine className="h-4 w-4" /> Scan / Upload Document
        </Button>
      </div>

      <Card className="card-glass">
        <div className="p-4 border-b border-border/50">
          <h2 className="text-sm font-medium">Recent documents</h2>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File name</TableHead>
                <TableHead>Document type</TableHead>
                <TableHead>Source workflow</TableHead>
                <TableHead>Linked record</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                    No documents yet. Click "Scan / Upload Document" to get started.
                  </TableCell>
                </TableRow>
              )}
              {docs.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-mono text-xs max-w-[280px] truncate">{d.file_name}</TableCell>
                  <TableCell>{d.doc_type}</TableCell>
                  <TableCell className="text-muted-foreground">{d.source}</TableCell>
                  <TableCell>{d.linked_label}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{d.status}</Badge></TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {new Date(d.uploaded_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {d.file_url && (
                      <Button variant="ghost" size="sm" onClick={() => openAttachment(d.file_url, d.linked_label)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>What are you uploading?</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            {DOC_TYPES.map((t) => (
              <button
                key={t.key}
                onClick={() => handlePick(t.key)}
                className="flex items-start gap-3 p-4 rounded-lg border border-border/60 hover:border-primary hover:bg-accent/40 transition-all text-left"
              >
                <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                  <t.icon className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-sm">{t.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <AttachmentViewerDialog
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        fileUrl={viewerUrl}
        title={viewerTitle}
      />
    </div>
  );
}
