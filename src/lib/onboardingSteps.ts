/**
 * Canonical onboarding step definitions for the Platform Admin cockpit.
 * Step keys are stable strings and must not change once shipped — they are the
 * primary key inside `tenant_onboarding.steps`.
 */
export type StepStatus = "not_started" | "in_progress" | "complete" | "skipped";

export interface StepState {
  status: StepStatus;
  completed_at?: string;
  completed_by?: string;
  skipped_reason?: string;
  notes?: string;
}

export interface OnboardingStepDef {
  key: string;
  label: string;
  description: string;
  optional?: boolean;
}

export interface OnboardingPhaseDef {
  phase: number;
  title: string;
  subtitle: string;
  optional?: boolean;
  steps: OnboardingStepDef[];
}

export const ONBOARDING_PHASES: OnboardingPhaseDef[] = [
  {
    phase: 1,
    title: "Structure",
    subtitle: "Legal entities, venues under each entity, and where the client operates.",
    steps: [
      { key: "org_entities", label: "Organizations (legal entities)", description: "Create each legal entity — name, BR#, incorporation date, registered address, auditor." },
      { key: "venues", label: "Venues under each organization", description: "Add every venue and assign it to its parent organization." },
      { key: "localisation", label: "Localisation & financial year", description: "Timezone, base currency, financial year end, first FY start year." },
    ],
  },
  {
    phase: 2,
    title: "Operational spine",
    subtitle: "The master data that lets sales, purchases, and revenue flow.",
    steps: [
      { key: "coa", label: "Chart of accounts", description: "Load the F&B template, import a CSV, or start from a blank chart." },
      { key: "suppliers", label: "Suppliers", description: "Bulk-import the client's supplier list or add manually." },
      { key: "revenue", label: "Revenue sources & service periods", description: "Confirm revenue sources and per-venue service periods so sales can land from day one." },
    ],
  },
  {
    phase: 3,
    title: "Go live operationally",
    subtitle: "The client sees live data in the first week — this phase is a checklist.",
    steps: [
      { key: "first_sale", label: "First sales record entered", description: "At least one daily sales record posted for a venue." },
      { key: "first_invoice", label: "First invoice uploaded", description: "At least one procurement invoice captured." },
    ],
  },
  {
    phase: 4,
    title: "Accounting completeness",
    subtitle: "Opening balances so historical reports tie out. Optional — clients starting fresh can skip.",
    optional: true,
    steps: [
      { key: "gl_opening", label: "GL opening balances", description: "Debit/credit per account per organization at the conversion date. Must balance to post." },
      { key: "ar_opening", label: "AR opening balances", description: "Open customer invoices at conversion date, reconciled to the AR control account.", optional: true },
      { key: "ap_opening", label: "AP opening balances", description: "Open supplier bills at conversion date, reconciled to the AP control account.", optional: true },
    ],
  },
  {
    phase: 5,
    title: "Team",
    subtitle: "Invite the client's users and set per-user page/venue permissions.",
    steps: [
      { key: "team", label: "Invite users", description: "Add the client admin and any operators. Manage ongoing access from /user-access." },
    ],
  },
];

export const ALL_STEP_KEYS = ONBOARDING_PHASES.flatMap((p) => p.steps.map((s) => s.key));

export function getStepState(steps: Record<string, StepState> | null | undefined, key: string): StepState {
  return steps?.[key] ?? { status: "not_started" };
}

export function computePhaseProgress(steps: Record<string, StepState> | null | undefined, phase: OnboardingPhaseDef) {
  const total = phase.steps.length;
  let done = 0;
  for (const s of phase.steps) {
    const st = getStepState(steps, s.key).status;
    if (st === "complete" || st === "skipped") done += 1;
  }
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
}

export function computeOverallProgress(steps: Record<string, StepState> | null | undefined) {
  const total = ALL_STEP_KEYS.length;
  let done = 0;
  let skipped = 0;
  for (const key of ALL_STEP_KEYS) {
    const st = getStepState(steps, key).status;
    if (st === "complete") done += 1;
    else if (st === "skipped") skipped += 1;
  }
  return { done, skipped, total, pct: Math.round(((done + skipped) / total) * 100) };
}

export function currentPhase(steps: Record<string, StepState> | null | undefined): number {
  for (const p of ONBOARDING_PHASES) {
    const prog = computePhaseProgress(steps, p);
    if (prog.done < prog.total) return p.phase;
  }
  return ONBOARDING_PHASES.length;
}
