import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/utils/fetchAllRows', () => ({ fetchAllRows: mocks.fetch }));
vi.mock('@/hooks/useActiveTenant', () => ({ useActiveTenant: () => ({ tenantId: 'ff000000-0000-4000-8000-000000000001', loading: false }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) }) } }));
import { useInvoiceData } from '@/hooks/useInvoiceData';

describe('invoice read readiness', () => {
  beforeEach(() => { mocks.fetch.mockReset(); });
  it('ends initial loading with an explicit error instead of an empty success on failed read', async () => {
    mocks.fetch.mockRejectedValue(new Error('Read unavailable'));
    const { result } = renderHook(() => useInvoiceData());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Read unavailable');
    expect(result.current.invoices).toEqual([]);
  });
  it('keeps valid same-scope invoices during failed background refresh and permits retry', async () => {
    mocks.fetch.mockImplementation(async (table: string) => table === 'invoices' ? [{ id: 'invoice-1', supplier_id: 'supplier-1', total_amount: 125 }] : [{ id: 'supplier-1', name: 'QA Supplier' }]);
    const { result } = renderHook(() => useInvoiceData());
    await waitFor(() => expect(result.current.invoices).toHaveLength(1));
    mocks.fetch.mockRejectedValue(new Error('Refresh unavailable'));
    await act(async () => { await result.current.fetchAll(); });
    expect(result.current.loading).toBe(false);
    expect(result.current.invoices[0].total_amount).toBe(125);
    expect(result.current.error).toBe('Refresh unavailable');
    mocks.fetch.mockResolvedValue([]);
    await act(async () => { await result.current.fetchAll(); });
    expect(result.current.error).toBeNull();
    expect(result.current.invoices).toEqual([]);
  });
});