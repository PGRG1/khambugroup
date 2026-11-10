import { describe, expect, it } from 'vitest';
import { assignedWorkForPerson, assignmentNoticeId, assignmentReceiptKey, type AssignedWork } from '@/utils/assignmentNotices';
const task: AssignedWork = { id: 'task-1', tenant_id: 'tenant-1', assignee_id: 'person-1', accepted_by: 'manager', title: 'Review', recommendation: 'Check source', accepted_at: '2026-11-10', status: 'open', venue_id: null };
describe('assignment-only notices', () => {
  it('shows only the actual assignee in the active tenant', () => {
    expect(assignedWorkForPerson([task, { ...task, id: 'other', assignee_id: 'person-2' }, { ...task, id: 'unassigned', assignee_id: null }, { ...task, id: 'cross', tenant_id: 'tenant-2' }], 'tenant-1', 'person-1')).toEqual([task]);
  });
  it('excludes completed work and deduplicates without changing status', () => {
    expect(assignedWorkForPerson([task, task, { ...task, id: 'done', status: 'completed' }], 'tenant-1', 'person-1')).toEqual([task]);
    expect(task.status).toBe('open');
  });
  it('separates read receipts by tenant and person', () => {
    expect(assignmentReceiptKey('tenant-1', 'person-1')).not.toBe(assignmentReceiptKey('tenant-2', 'person-1'));
    expect(assignmentReceiptKey('tenant-1', 'person-1')).not.toBe(assignmentReceiptKey('tenant-1', 'person-2'));
  });
  it('does not re-notify on task edits, but distinguishes a different assignee', () => {
    expect(assignmentNoticeId(task)).toBe(assignmentNoticeId({ ...task, recommendation: 'Edited' }));
    expect(assignmentNoticeId(task)).not.toBe(assignmentNoticeId({ ...task, assignee_id: 'person-2' }));
  });
});