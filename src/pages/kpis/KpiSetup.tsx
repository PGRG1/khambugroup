import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import KpiAssignmentBoard from "@/pages/kpis/KpiAssignmentBoard";
import KpiTargets from "@/pages/kpis/KpiTargets";
import { cn } from "@/lib/utils";

type Tab = "assignments" | "targets";

export default function KpiSetup() {
  const [params, setParams] = useSearchParams();
  const initial = (params.get("tab") as Tab) || "assignments";
  const [tab, setTab] = useState<Tab>(initial === "targets" ? "targets" : "assignments");

  useEffect(() => {
    const t = (params.get("tab") as Tab) || "assignments";
    setTab(t === "targets" ? "targets" : "assignments");
  }, [params]);

  const go = (t: Tab) => {
    setTab(t);
    setParams({ tab: t }, { replace: true });
  };

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto space-y-5">
      <header>
        <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Performance</div>
        <h1 className="text-xl sm:text-2xl font-semibold font-display tracking-tight">KPI Setup</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          Assign each KPI to a named person and give it a usable target.
        </p>
      </header>

      <div className="flex items-center gap-1 border-b border-border/60">
        <TabButton active={tab === "assignments"} onClick={() => go("assignments")}>Assignments</TabButton>
        <TabButton active={tab === "targets"} onClick={() => go("targets")}>Targets</TabButton>
      </div>

      {tab === "assignments"
        ? <KpiAssignmentBoard embedded onOpenTargets={() => go("targets")} />
        : <KpiTargets embedded />}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={cn(
        "h-9 px-3 text-[13px] font-medium border-b-2 -mb-px transition",
        active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >{children}</button>
  );
}
