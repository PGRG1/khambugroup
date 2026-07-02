import { Link } from "react-router-dom";

export const fmtDate = (s?: string | null) => {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

export const healthColor = (bal: number, threshold: number) => {
  if (bal <= threshold * 0.5) return "text-red-500";
  if (bal <= threshold) return "text-amber-500";
  return "text-emerald-500";
};

export function KpiTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "warn" | "bad";
}) {
  const toneClass =
    tone === "bad"
      ? "text-red-500"
      : tone === "warn"
      ? "text-amber-500"
      : tone === "good"
      ? "text-emerald-500"
      : "";
  return (
    <div className="card-glass rounded-xl p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold mt-1 ${toneClass}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-500/15 text-amber-500",
    approved: "bg-blue-500/15 text-blue-500",
    rejected: "bg-red-500/15 text-red-500",
    posted: "bg-emerald-500/15 text-emerald-500",
  };
  return <span className={`px-2 py-0.5 rounded text-[11px] ${map[status] || "bg-muted"}`}>{status}</span>;
}

export function PettyCashHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 className="text-2xl font-semibold font-display tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
        ← Back to Home
      </Link>
    </header>
  );
}
