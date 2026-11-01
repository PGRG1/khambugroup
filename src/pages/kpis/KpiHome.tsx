import { useState } from "react";
import MyKpiView from "@/components/kpi/MyKpiView";
import TeamKpiView from "@/components/kpi/TeamKpiView";
import { cn } from "@/lib/utils";

export default function KpiHome() {
  const [view, setView] = useState<"mine" | "team">("mine");

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Performance</div>
          <h1 className="text-xl sm:text-2xl font-semibold font-display tracking-tight">KPIs</h1>
        </div>
        <div className="inline-flex rounded-lg border border-border/60 bg-muted/30 p-0.5">
          <Segment active={view === "mine"} onClick={() => setView("mine")}>My View</Segment>
          <Segment active={view === "team"} onClick={() => setView("team")}>Team View</Segment>
        </div>
      </header>

      {view === "mine" ? <MyKpiView /> : <TeamKpiView />}
    </div>
  );
}

function Segment({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={cn(
        "h-9 px-4 rounded-md text-xs font-medium transition whitespace-nowrap",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >{children}</button>
  );
}
