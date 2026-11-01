import {describe,it,expect} from 'vitest';
import {reconciliationDifference,reconciliationReady,type ReconciliationRow} from '@/utils/financeOverview';
const row:ReconciliationRow={key:'supplier',name:'Supplier ledger',books:5908186.85,detail:5440545.93,difference:-467640.92,note:'',state:'open',snapshot:'one',reason:null,items:[]};
describe('Finance reconciliations',()=>{
 it('supplier difference is detail minus books, not the reverse',()=>expect(reconciliationDifference(5908186.85,5440545.93)).toBe(-467640.92));
 it('wages show +33345 from unpaid payroll versus books',()=>expect(reconciliationDifference(1150709.9,1184054.9)).toBe(33345));
 it('MPF agrees at 79774.80',()=>expect(reconciliationDifference(79774.8,79774.8)).toBe(0));
 it('open differences block closing until explained',()=>{expect(reconciliationReady([row],0)).toBe(false);expect(reconciliationReady([{...row,reason:'Timing difference reviewed'}],0)).toBe(true);});
 it('any open matching exception still blocks an explained reconciliation',()=>expect(reconciliationReady([{...row,reason:'Reviewed'}],1)).toBe(false));
 it('agreed and setup rows allow closing but unloaded rows do not',()=>{expect(reconciliationReady([{...row,state:'agrees'},{...row,state:'set up'}],0)).toBe(true);expect(reconciliationReady([],0)).toBe(false);});
});
