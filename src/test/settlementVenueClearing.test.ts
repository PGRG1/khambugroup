import {describe,it,expect} from 'vitest';
import {settlementVenueClearing} from '@/utils/settlementVenueClearing';
describe('KPay venue clearing',()=>{
 it('Caliente + Hanabi clears each supplied venue, never Assembly',()=>expect(settlementVenueClearing({venue:null,shared_venues:['Caliente','Hanabi']},[{venue:'Caliente',amount:700},{venue:'Hanabi',amount:300}],{Assembly:'1290',Caliente:'1291',Hanabi:'1292'})).toEqual([{venue:'Caliente',account:'1291',amount:700},{venue:'Hanabi',account:'1292',amount:300}]));
 it('blocks a shared batch without venue evidence instead of generic fallback',()=>expect(()=>settlementVenueClearing({venue:null,shared_venues:['Caliente','Hanabi']},[{venue:null,amount:1000}],{Assembly:'1290'})).toThrow('explicit venue lines'));
 it('a single merchant uses its own venue',()=>expect(settlementVenueClearing({venue:'Caliente',shared_venues:[]},[{venue:null,amount:100}],{Assembly:'1290',Caliente:'1291'})).toEqual([{venue:'Caliente',account:'1291',amount:100}]));
});