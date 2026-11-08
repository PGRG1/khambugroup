import { describe,it,expect } from 'vitest';
import { navigationPath,internalNavigation } from '../../supabase/functions/chat-assistant/navigationRules';
const id='ff000000-0000-4000-8000-000000000001';
describe('Bani navigation guardrails',()=>{
 it('opens the exact invoice without save flags',()=>expect(navigationPath({screen:'invoices',record_id:id})).toBe(`/procurement/invoices?invoice=${id}`));
 it('rejects arbitrary paths and extra write parameters',()=>{expect(navigationPath({screen:'https://evil.test'})).toBeNull();expect(navigationPath({screen:'invoices',post:true})).toBeNull();});
 it('rejects external and protocol-relative markdown navigation',()=>{expect(internalNavigation('https://evil.test')).toBeNull();expect(internalNavigation('//evil.test')).toBeNull();});
 it('cannot open sales in edit mode',()=>expect(internalNavigation(`/sales-data/${id}?edit=1`)).toBeNull());
 it('accepts only a real Monday rota week',()=>{expect(navigationPath({screen:'rota',week:'2026-11-09'})).toBe('/hr/schedule?week=2026-11-09');expect(navigationPath({screen:'rota',week:'2026-11-10'})).toBeNull();expect(navigationPath({screen:'rota',week:'2026-02-30'})).toBeNull();});
 it('opens disputed Purchasing invoices not expense bills',()=>expect(navigationPath({screen:'invoices',status:'Disputed'})).toBe('/procurement/invoices?review_status=Disputed'));
});