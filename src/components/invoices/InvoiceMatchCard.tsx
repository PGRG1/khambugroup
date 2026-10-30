import { Button } from "@/components/ui/button";
import { formatCurrency, formatDecimal } from "@/utils/format";
import type { MatcherAnswer, MatcherOption } from "@/utils/scannerMatcher";
import type { ReactNode } from "react";

export default function InvoiceMatchCard({ answer, options, printed, name, onPick, onSearch, quickAdd, editFirst, existingAdd }: { answer: MatcherAnswer; options: MatcherOption[]; printed: string; name?: string; onPick: (id: string) => void; onSearch: () => void; quickAdd: ReactNode; editFirst?: ReactNode; existingAdd?: ReactNode }) {
  if (answer.decision === "sure") return <div className="flex flex-wrap items-center gap-2 text-muted-foreground"><details><summary className="cursor-pointer" title={answer.reason}>Matched item</summary><p>{answer.reason}</p></details><Button variant="link" size="sm" onClick={onSearch}>Change item</Button></div>;
  if (answer.decision === "not_a_product") return <div className="flex flex-wrap items-center gap-2 text-muted-foreground" title={answer.reason}>Charge, not an item<Button variant="link" size="sm" onClick={onSearch}>Change item</Button></div>;
  return <div className="space-y-2 rounded-md border border-warning/30 bg-warning/5 p-2 break-words">
    <p className="text-muted-foreground">Invoice reads: {printed}</p>
    <p className="font-medium">{answer.decision === "probably" ? `Probably ${name || "an existing item"}` : answer.decision === "new" ? answer.draft?.name || "New item" : "Couldn't tell which item this is"}</p>
    <p>{answer.reason}</p>
    {answer.decision === "probably" && <div className="flex flex-wrap gap-2">{existingAdd || <Button size="sm" onClick={() => answer.product_master_id && onPick(answer.product_master_id)}>Yes</Button>}<Button size="sm" variant="outline" onClick={onSearch}>Pick another</Button></div>}
    {answer.decision === "cant_tell" && <div className="space-y-1">{options.slice(0, 3).map(option => <Button key={option.id} variant="outline" className="h-auto w-full justify-start whitespace-normal text-left" onClick={() => onPick(option.id)}>{option.name} · {option.last_paid == null ? "No past price" : formatCurrency(option.last_paid)} · {formatDecimal(option.times_bought)} bought</Button>)}{quickAdd}<Button size="sm" variant="link" onClick={onSearch}>Search Items Master</Button></div>}
    {answer.decision === "new" && <><p className="text-muted-foreground">{[answer.draft?.category, answer.draft?.purchase_unit, answer.draft?.stock_unit, answer.draft?.units_per_purchase_unit && `${formatDecimal(answer.draft.units_per_purchase_unit)} per purchase unit`, answer.draft?.unit_price != null && formatCurrency(answer.draft.unit_price), answer.draft?.supplier_code].filter(Boolean).join(" · ")}</p><div className="flex flex-wrap gap-2">{quickAdd}{editFirst}<Button size="sm" variant="outline" onClick={onSearch}>It's an existing item ▾</Button></div></>}
  </div>;
}