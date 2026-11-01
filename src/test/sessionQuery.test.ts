import {describe,it,expect} from 'vitest';
import {sameSessionPrevious} from '@/utils/sessionQuery';
describe('session query isolation',()=>{
 const key=['sales-records','owner','khambu',null];
 it('retains rows during same-context refresh',()=>expect(sameSessionPrevious([1],{queryKey:key},key)).toEqual([1]));
 it.each([
  {next:['sales-records','other','khambu',null]},
  {next:['sales-records','owner','other-tenant',null]},
  {next:['sales-records','owner','khambu','manager']},
 ])('never retains rows across identity $next',({next})=>expect(sameSessionPrevious([1],{queryKey:key},next)).toBeUndefined());
});