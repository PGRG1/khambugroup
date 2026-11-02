import {expect,it} from 'vitest';
import {deferredCardTipLines} from '@/utils/deferredCardTips';
it('includes card tips in clearing and credits tips payable once',()=>{expect(deferredCardTipLines(1120,-120,1000)).toEqual({clearingDebit:1120,tipsCredit:120,salesCredit:1000});});
it('rejects tips not included in printed tenders',()=>{expect(()=>deferredCardTipLines(1000,-120,1000)).toThrow('Payments must balance');});
it('rejects positive tips instead of deducting twice',()=>{expect(()=>deferredCardTipLines(1120,120,1000)).toThrow('Negative cents');});