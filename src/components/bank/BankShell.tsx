import React from "react";

export function BankPageShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-semibold tracking-tight">{title}</h1>
          {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function BankKpi({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "success" | "warn" | "danger" | "info";
}) {
  const ring =
    tone === "success"
      ? "ring-emerald-500/30"
      : tone === "warn"
      ? "ring-amber-500/30"
      : tone === "danger"
      ? "ring-rose-500/30"
      : tone === "info"
      ? "ring-sky-500/30"
      : "ring-border";
  return (
    <div className={`card-glass rounded-xl p-4 ring-1 ${ring}`}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-2xl font-mono font-semibold mt-1 td-num">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

export function fmtMoney(n?: number | null, ccy = "HKD") {
  const v = Number(n ?? 0);
  return `${ccy} ${v.toLocaleString("en-HK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtDate(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][dt.getMonth()];
  return `${String(dt.getDate()).padStart(2, "0")} ${m} ${dt.getFullYear()}`;
}
