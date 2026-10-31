import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/utils/fetchAllRows';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { useAuth } from '@/hooks/useAuth';
import { usePreviewMode } from '@/hooks/usePreviewMode';
import type { CorrectionLink } from '@/utils/booksReview';

export function useBookReview() {
  const { tenantId } = useActiveTenant();
  const { user } = useAuth();
  const { isPreviewActive, previewUserId } = usePreviewMode();
  const [data,setData] = useState<{ corrections: CorrectionLink[]; reviews: any[]; sales: any[]; closed: any[]; invoices: any[]; bills: any[]; audit: any[] }>({corrections:[],reviews:[],sales:[],closed:[],invoices:[],bills:[],audit:[]});
  const [owner,setOwner] = useState(false);
  const [error,setError] = useState('');
  const [loading,setLoading] = useState(true);
  const reload = useCallback(async () => {
    if (!tenantId) { setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const rows = await Promise.all(['finance_book_corrections','bani_accounting_reviews','sales_records','finance_closed_periods','invoices','expense_bills','ledger_audit_log'].map(t=>fetchAllRows(t,'*',{col:'id',asc:true},tenantId,true)));
      setData({corrections:rows[0],reviews:rows[1],sales:rows[2],closed:rows[3],invoices:rows[4],bills:rows[5],audit:rows[6]});
      const uid = isPreviewActive ? previewUserId : user?.id;
      if (uid) { const {data:o,error:e}=await supabase.rpc('people_owner',{t:tenantId,u:uid}); setOwner(!e && !!o); }
    } catch(e) { setError((e as Error).message); } finally { setLoading(false); }
  },[tenantId,user?.id,isPreviewActive,previewUserId]);
  useEffect(()=>{void reload();},[reload]);
  return {...data,tenantId,owner,error,loading,reload,isPreviewActive};
}