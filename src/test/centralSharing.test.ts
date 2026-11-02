import {expect,it} from 'vitest';
import {centralShares} from '@/utils/centralSharing';
it('defaults to sales and retains cents exactly',()=>{expect(centralShares(100.01,[{name:'A',sales:300},{name:'B',sales:100}])).toEqual({shares:[75.01,25],unallocated:0});});
it('uses configured equal shares',()=>{expect(centralShares(90,[{name:'A',sales:300},{name:'B',sales:100}],'equal').shares).toEqual([45,45]);});
it('does not invent a sales basis for a zero-sales period',()=>{expect(centralShares(90,[{name:'A',sales:0}])).toEqual({shares:[0],unallocated:90});});
it('allocates reversals without changing the total',()=>{expect(centralShares(-100.01,[{name:'A',sales:300},{name:'B',sales:100}]).shares).toEqual([-75.01,-25]);});