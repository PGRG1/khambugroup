import {describe,it,expect} from 'vitest';
import {buildSupplierContainers,containerIdentity,type DepositLine} from '../utils/supplierDeposits';
const line=(name:string,qty:number,unitCost=50):DepositLine=>({id:name,productId:name,name,qty,unitCost,unit:'Keg',venue:'Assembly',receivedDate:'2026-10-31'});
describe('supplier received deposits',()=>{
  it('groups the named Stella paid and empty container',()=>{expect(containerIdentity('Deposit - Stella Artois - 30L Keg (B)')).toBe(containerIdentity('Stella Artois - 30L Keg (B) - Empty Keg'));});
  it('paid and returned count quantities, out subtracts them and held keeps net value',()=>{const [row]=buildSupplierContainers([line('Deposit - Asahi 10L Keg',4),line('Asahi 10L Keg Empty',-1)]);expect(row).toMatchObject({paid:4,returned:1,out:3,held:150});});
  it('does not combine different sizes or brands',()=>{expect(buildSupplierContainers([line('Asahi 10L Keg',1),line('Asahi 20L Keg',1),line('Stella 10L Keg',1)])).toHaveLength(3);});
  it('preserves return-only evidence without inventing paid deposits',()=>{expect(buildSupplierContainers([line('Asahi 10L Keg Empty',-2)])[0]).toMatchObject({paid:0,returned:2,out:-2,held:-100});});
  it('uses each received price for net held value',()=>{expect(buildSupplierContainers([line('Asahi 10L Keg',2,60),line('Asahi 10L Keg Empty',-1,50)])[0].held).toBe(70);});
});