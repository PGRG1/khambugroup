import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useHRData, type HREmployee } from "@/hooks/useHRData";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Building2 } from "lucide-react";

const UNASSIGNED = "__unassigned__";

function initials(emp: HREmployee) {
  return `${emp.first_name?.[0] ?? ""}${emp.last_name?.[0] ?? ""}`.toUpperCase();
}

function EmployeeNode({ emp }: { emp: HREmployee }) {
  return (
    <div className="card-glass rounded-lg p-3 min-w-[200px] flex items-center gap-3 border border-border/50">
      <div className="h-10 w-10 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-semibold shrink-0">
        {initials(emp) || "?"}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">
          {emp.first_name} {emp.last_name}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {emp.job_title || "—"}
        </div>
        {emp.venue && (
          <div className="text-[10px] text-muted-foreground/70 truncate mt-0.5">
            {emp.venue}
          </div>
        )}
      </div>
    </div>
  );
}

export default function HROrgChart() {
  const { employees, departments, loading } = useHRData();

  const grouped = useMemo(() => {
    const active = employees.filter((e) => e.status === "active" || e.status === "Active" || !e.status);
    const map = new Map<string, HREmployee[]>();
    for (const e of active) {
      const key = e.department_id || UNASSIGNED;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    const ordered = departments
      .filter((d) => d.is_active)
      .map((d) => ({
        id: d.id,
        name: d.name,
        description: d.description,
        members: (map.get(d.id) || []).sort((a, b) => a.sort_order - b.sort_order),
      }));
    const unassigned = map.get(UNASSIGNED);
    if (unassigned?.length) {
      ordered.push({
        id: UNASSIGNED,
        name: "Unassigned",
        description: null,
        members: unassigned,
      });
    }
    return ordered;
  }, [employees, departments]);

  const totalActive = grouped.reduce((s, g) => s + g.members.length, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="w-full mx-auto space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-display font-semibold tracking-tight">
            Organization Chart
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Active team structure grouped by department
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="gap-1.5">
            <Building2 className="h-3.5 w-3.5" /> {grouped.length} departments
          </Badge>
          <Badge variant="outline" className="gap-1.5">
            <Users className="h-3.5 w-3.5" /> {totalActive} employees
          </Badge>
        </div>
      </div>

      {/* Root node */}
      <div className="flex flex-col items-center">
        <Card className="card-glass px-6 py-4 text-center border border-primary/30">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Organization
          </div>
          <div className="text-lg font-display font-semibold mt-0.5">
            KHAMBU Group
          </div>
        </Card>
        {grouped.length > 0 && (
          <div className="w-px h-6 bg-border" />
        )}
      </div>

      {/* Departments */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {grouped.map((dept) => (
          <Card key={dept.id} className="card-glass p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-border/50 pb-2">
              <div>
                <div className="font-semibold">{dept.name}</div>
                {dept.description && (
                  <div className="text-xs text-muted-foreground">
                    {dept.description}
                  </div>
                )}
              </div>
              <Badge variant="secondary" className="td-num">
                {dept.members.length}
              </Badge>
            </div>
            {dept.members.length === 0 ? (
              <div className="text-xs text-muted-foreground italic py-4 text-center">
                No employees
              </div>
            ) : (
              <div className="space-y-2">
                {dept.members.map((emp) => (
                  <EmployeeNode key={emp.id} emp={emp} />
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>

      {grouped.length === 0 && (
        <div className="text-center text-muted-foreground py-12">
          No departments or employees yet.
        </div>
      )}
    </div>
  );
}
