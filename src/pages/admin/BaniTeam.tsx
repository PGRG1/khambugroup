import { useCallback, useEffect, useState } from "react";
import { MoreHorizontal, Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";

// Control plane › Bani team: one table of everyone at Bani (all Bani admins for now). Add someone with a temporary
// password shown once; the ··· on each row resets a password or removes them. Server: supabase/functions/bani-team.
type Person = { id: string; email: string; name: string; added: string; pending: boolean; you: boolean };
type Shown = { name: string; email: string; password: string };

async function call(body: Record<string, unknown>) {
  const res = await supabase.functions.invoke("bani-team", { body });
  if (res.data?.error) throw new Error(String(res.data.error));
  if (res.error) {
    let msg = res.error.message;
    try { const b = await (res.error as any).context?.json?.(); if (b?.error) msg = String(b.error); } catch { /* not JSON */ }
    throw new Error(msg);
  }
  return res.data;
}
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Hong_Kong" });

function PasswordCard({ shown, onDone }: { shown: Shown; onDone: () => void }) {
  const first = shown.name.split(" ")[0] || "them";
  const where = window.location.origin.replace(/^https?:\/\//, "");
  const msg = `Your Bani sign-in\n${where}\nEmail: ${shown.email}\nTemporary password: ${shown.password}\nYou will set your own password when you sign in. This one stops working after 7 days.`;
  const link = "text-[13px] font-medium text-[#1F6B5E]";
  return <section className="card-glass rounded-xl p-4 sm:p-5 space-y-3">
    <h2 className="text-base font-semibold">Temporary password</h2>
    <p className="text-[13px] text-muted-foreground">Give this to {first}. It works until they set their own password, up to 7 days. You can show it again from Bani team.</p>
    <p className="flex h-[52px] select-all items-center justify-center rounded-xl border border-dashed border-[#9CC3A8] bg-[#F1F6F3] font-mono text-[22px] tracking-[.12em]">{shown.password}</p>
    <div className="flex flex-wrap items-center gap-5">
      <button type="button" className={link} onClick={() => void navigator.clipboard.writeText(shown.password).then(() => toast({ title: "Password copied" }))}>Copy</button>
      <a className={link} href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a>
      <a className={link} href={`mailto:${encodeURIComponent(shown.email)}?subject=${encodeURIComponent("Your Bani sign-in")}&body=${encodeURIComponent(msg)}`}>Email it to {first}</a>
      <span className="flex-1" />
      <Button className="h-10 rounded-full" onClick={onDone}>Done</Button>
    </div>
  </section>;
}

export default function BaniTeam() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ first: "", last: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<Shown | null>(null);
  const [removing, setRemoving] = useState<Person | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try { setPeople(((await call({ action: "list" })).people ?? []) as Person[]); }
    catch (e) { toast({ title: (e as Error).message, variant: "destructive" }); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    setBusy(true);
    try {
      const name = `${form.first.trim()} ${form.last.trim()}`.trim();
      const r = await call({ action: "add", name, firstName: form.first.trim(), lastName: form.last.trim(), email: form.email.trim() });
      setAdding(false);
      if (r.tempPassword) setShown({ name: name || form.email.trim(), email: form.email.trim(), password: r.tempPassword });
      else toast({ title: `${name || form.email.trim()} now has Bani access with their existing login` });
      setForm({ first: "", last: "", email: "" }); void load();
    } catch (e) { toast({ title: (e as Error).message, variant: "destructive" }); }
    setBusy(false);
  };
  const reset = async (p: Person, action: "reset" | "show" = "reset") => {
    try { const r = await call({ action, user_id: p.id }); setShown({ name: p.name, email: p.email, password: r.tempPassword }); void load(); }
    catch (e) { toast({ title: (e as Error).message, variant: "destructive" }); }
  };
  const remove = async () => {
    if (!removing) return;
    try { await call({ action: "remove", user_id: removing.id }); toast({ title: `${removing.name} removed from the Bani team` }); setRemoving(null); void load(); }
    catch (e) { toast({ title: (e as Error).message, variant: "destructive" }); }
  };

  const q = search.trim().toLowerCase();
  const shownRows = people.filter((p) => !q || `${p.name} ${p.email}`.toLowerCase().includes(q));
  const pending = people.filter((p) => p.pending).length;
  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim()) && !!form.first.trim();

  return <div className="px-4 py-5 sm:p-6 space-y-5 max-w-[920px] mx-auto">
    <div className="flex items-center justify-between gap-3">
      <h1 className="text-[22px] sm:text-2xl font-semibold tracking-tight">{adding ? "Add team member" : "Bani team"}</h1>
      {!adding && !shown && <Button variant="outline" className="h-10 rounded-full bg-white" onClick={() => setAdding(true)}><Plus className="h-4 w-4 mr-1" />Add team member</Button>}
    </div>

    {shown ? <PasswordCard shown={shown} onDone={() => setShown(null)} />
    : adding ? <section className="card-glass rounded-xl p-4 sm:p-5 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-[12.5px] text-muted-foreground">First name<Input value={form.first} onChange={(e) => setForm({ ...form, first: e.target.value })} className="h-10 text-[14px] text-foreground" /></label>
        <label className="grid gap-1 text-[12.5px] text-muted-foreground">Last name<Input value={form.last} onChange={(e) => setForm({ ...form, last: e.target.value })} className="h-10 text-[14px] text-foreground" /></label>
        <label className="grid gap-1 text-[12.5px] text-muted-foreground">Email<Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-10 text-[14px] text-foreground" /></label>
      </div>
      <p className="text-[12.5px] text-muted-foreground">Everyone on the Bani team is a Bani admin for now.</p>
      <div className="flex justify-end gap-2"><Button variant="ghost" className="rounded-full" onClick={() => setAdding(false)}>Cancel</Button><Button className="h-10 rounded-full" disabled={!valid || busy} onClick={() => void add()}>{busy ? "Adding…" : "Add team member"}</Button></div>
    </section>
    : <section className="card-glass rounded-xl p-3 sm:p-4 space-y-3 min-w-0" aria-label="Bani team">
      <h2 className="text-base font-semibold px-1 flex flex-wrap gap-x-1.5"><span>{people.length} {people.length === 1 ? "person" : "people"}</span>{pending > 0 && <span className="text-[13px] text-muted-foreground font-normal">· {pending} not signed in yet</span>}</h2>
      <label className="flex h-10 items-center gap-2 rounded-full border border-border bg-white px-3.5"><Search className="h-4 w-4 text-muted-foreground" /><input aria-label="Search team" placeholder="Search team" value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-0 flex-1 bg-transparent text-[13px] outline-none" /></label>
      {!shownRows.length ? <p className="p-10 text-center text-sm text-muted-foreground">{loading ? "Loading…" : q ? "Nothing matches your search." : "No one yet."}</p>
      : <div className="overflow-x-auto"><table className="w-full min-w-[640px] border-collapse text-[13px]" aria-label="Bani team">
        <thead><tr className="text-[12px] text-muted-foreground">{["Person", "Email", "Role", "Sign-in", "Added"].map((h) => <th key={h} scope="col" className="h-9 px-2 text-left font-medium whitespace-nowrap border-b border-[#ECEAE3]">{h}</th>)}<th className="w-10 border-b border-[#ECEAE3]"><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{shownRows.map((p) => <tr key={p.id}>
          <td className="h-11 px-2 font-medium whitespace-nowrap border-b border-[#ECEAE3]">{p.name}{p.you && <span className="font-normal text-muted-foreground"> · you</span>}</td>
          <td className="h-11 px-2 whitespace-nowrap border-b border-[#ECEAE3]">{p.email}</td>
          <td className="h-11 px-2 whitespace-nowrap border-b border-[#ECEAE3]">Bani admin</td>
          <td className="h-11 px-2 whitespace-nowrap border-b border-[#ECEAE3]"><span className={`inline-flex items-center gap-1.5 ${p.pending ? "text-[#B45309]" : ""}`}><span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${p.pending ? "bg-[#C26A12]" : "bg-[#3E9B6B]"}`} />{p.pending ? "Password not set" : "Active"}</span></td>
          <td className="h-11 px-2 whitespace-nowrap border-b border-[#ECEAE3] text-muted-foreground">{day(p.added)}</td>
          <td className="h-11 px-1 text-right border-b border-[#ECEAE3]">{!p.you && <DropdownMenu><DropdownMenuTrigger asChild><button type="button" aria-label={`Actions for ${p.name}`} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-black/5"><MoreHorizontal className="h-4 w-4" /></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">{p.pending && <DropdownMenuItem onSelect={() => void reset(p, "show")}>Show temporary password</DropdownMenuItem>}<DropdownMenuItem onSelect={() => void reset(p)}>Reset password</DropdownMenuItem><DropdownMenuItem className="text-[#B4412F]" onSelect={() => setRemoving(p)}>Remove from Bani team</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}</td>
        </tr>)}</tbody></table></div>}
    </section>}

    <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove {removing?.name}?</AlertDialogTitle>
        <AlertDialogDescription>They lose all Bani access. Clients are not affected.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => void remove()}>Remove</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
