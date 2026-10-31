import {validateDrafts} from './policy.ts';
const ingredient={product_master_id:'unknown',description:'Rice',quantity:100,unit:'g',note:''};
const draft=(i:typeof ingredient)=>({dishes:[{name:'Rice bowl',category:'Food',prices:[{name:'Regular',price:80}],ingredients:[i]}]});
Deno.test('Invented product ids remain not found',()=>{const i=validateDrafts(draft(ingredient),new Map()).dishes[0].ingredients[0];if(i.product_master_id!==null||i.note!=='not found')throw new Error('Invented item accepted');});
Deno.test('Known ingredient preserves amount and uses candidate base unit',()=>{const i=validateDrafts(draft({...ingredient,product_master_id:'rice'}),new Map([['rice','gms']])).dishes[0].ingredients[0];if(i.quantity!==100||i.unit!=='gms'||i.product_master_id!=='rice')throw new Error('Candidate changed');});
Deno.test('Negative amounts rejected',()=>{let rejected=false;try{validateDrafts(draft({...ingredient,quantity:-1}),new Map());}catch{rejected=true;}if(!rejected)throw new Error('Negative accepted');});
Deno.test('Missing optional annotation does not reject valid ingredients',()=>{const {note,...i}=ingredient;const result=validateDrafts({dishes:[{...draft(ingredient).dishes[0],ingredients:[i]}]},new Map());if(result.dishes[0].ingredients[0].note!=='not found')throw new Error('Unknown lost');});
