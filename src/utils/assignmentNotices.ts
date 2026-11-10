export type AssignedWork = {
  id: string; tenant_id: string; assignee_id: string | null; accepted_by: string;
  title: string; recommendation: string; accepted_at: string; status: string; venue_id: string | null;
};

export const assignmentNoticeId = (task: AssignedWork) => `${task.id}:${task.assignee_id}:${task.accepted_at}`;
export const assignmentReceiptKey = (tenant: string, user: string) => `bani.assignment-reads:${tenant}:${user}`;

export function assignedWorkForPerson(tasks: AssignedWork[], tenant: string, user: string) {
  const unique = new Map<string, AssignedWork>();
  for (const task of tasks) {
    if (task.tenant_id === tenant && task.assignee_id === user && task.status === 'open') unique.set(task.id, task);
  }
  return [...unique.values()];
}

export function readAssignmentReceipts(key: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch { return []; }
}