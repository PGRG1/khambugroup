import {describe,it,expect} from 'vitest';
import {businessRole,channelFor,receives,splitChannels,operationalSignals} from '../../supabase/functions/_shared/smartAlerts/channels';
import {inQuietHours} from '../../supabase/functions/_shared/smartAlerts/delivery';
import type {Candidate} from '../../supabase/functions/_shared/smartAlerts/rules';
const a=(kind:string,area='bank'):Candidate=>({kind,area,subject:kind,venue_id:null,severity:'normal',title:kind,why:'evidence',baseline:null,actual:null,action_path:'/',date:'2026-11-01',payload:{}});
describe('Notification and work separation',()=>{
 it('never pushes housekeeping',()=>{for(const kind of ['missing_bank_statement','overdue_bill','unmatched_card_payouts','invoice_review','month_close_blocked','payroll_confirm'])expect(channelFor(a(kind))).toBe('work');});
 it('nests payment and payout symptoms under missing bank statements',()=>expect(splitChannels([a('missing_bank_statement'),a('overdue_bill'),a('unmatched_card_payouts')]).work.map(r=>r.kind)).toEqual(['missing_bank_statement']));
 it('routes venue manager notifications only to people and stock',()=>{expect(receives(a('sick_leave','hr'),'venue manager','notification')).toBe(true);expect(receives(a('sales_low','sales'),'venue manager','notification')).toBe(false);});
 it('routes purchasing to suppliers, not people',()=>{expect(receives(a('supplier_price_rise','procurement'),'purchasing','notification')).toBe(true);expect(receives(a('sick_leave','hr'),'purchasing','notification')).toBe(false);});
 it('owners receive big swings only outside summaries',()=>{expect(receives({...a('sales_low','sales'),payload:{change_percent:41}},'owner','notification')).toBe(true);expect(receives({...a('sales_low','sales'),payload:{change_percent:40}},'owner','notification')).toBe(false);});
 it('quiet hours begin at 11pm',()=>expect(inQuietHours('23:00')).toBe(true));
 it('quiet hours end at 8am',()=>expect(inQuietHours('08:00')).toBe(false));
 it('does not use display-only purchasing role as authority',()=>{expect(businessRole('member')).toBe('staff');expect(businessRole('member','Head chef')).toBe('purchasing');});
 it('builds only evidenced sick calls and disputed delivery shortages',()=>{const signals=operationalSignals({hr_employees:[{id:'e',first_name:'Anjan',venue_id:'v'}],hr_leave_types:[{id:'s',name:'Sick leave'}],hr_leave_requests:[{id:'l',employee_id:'e',leave_type_id:'s',status:'approved',approved_at:'2026-10-30',start_date:'2026-10-30',end_date:'2026-10-30'}],goods_received_notes:[{id:'g',status:'disputed',received_date:'2026-10-30',grn_number:'G1'}],grn_items:[{id:'i',grn_id:'g',issue:'short',quantity_received:2,quantity_invoiced:3}]},'2026-11-01');expect(signals.map(s=>s.kind)).toContain('sick_leave');expect(signals.map(s=>s.kind)).toContain('delivery_short');expect(operationalSignals({},'2026-11-01')).toEqual([]);});
});