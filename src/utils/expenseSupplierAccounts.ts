export type MeterAccount={id:string;supplier_id:string;account_number:string;label?:string|null;service_address?:string|null;split_method?:string;covers?:{venue_id:string;weight?:number}[];default_gl_account_id?:string|null};
export const normalizeMeter=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]/g,'');
export function splitAccount(amount:number,account:MeterAccount,sales:Record<string,number>={}){
 const covers=account.covers??[];if(!covers.length)throw new Error('Which venues does this account cover?');
 const weights=covers.map(v=>account.split_method==='sales'||account.split_method==='central'?sales[v.venue_id]??0:account.split_method==='single'?1:v.weight??0);
 const total=weights.reduce((n,w)=>n+w,0);if(total<=0||weights.some(w=>w<0)||new Set(covers.map(v=>v.venue_id)).size!==covers.length)throw new Error('Account split needs evidence');
 if(account.split_method==='single'&&covers.length!==1)throw new Error('Choose one venue for a 100% split');
 if(account.split_method==='fixed'&&Math.abs(total-100)>.001)throw new Error('Fixed shares must total 100%');
 let used=0;return covers.map((v,i)=>{const cents=i===covers.length-1?Math.round(amount*100)-used:Math.round(amount*100*weights[i]/total);used+=cents;return {venue_id:v.venue_id,amount:cents/100};});
}
export function matchExpenseSupplier(input:{account_number?:string;vendor_name:string;service_address?:string},accounts:MeterAccount[],suppliers:{id:string;name:string;address?:string|null}[],aliases:{supplier_id:string;alias:string}[]){
 const number=normalizeMeter(input.account_number??'');const meters=number?accounts.filter(a=>normalizeMeter(a.account_number)===number):[];
 if(meters.length===1)return {kind:'account' as const,supplier_id:meters[0].supplier_id,account_id:meters[0].id};
 if(meters.length>1)return {kind:'question' as const};
 const name=normalizeMeter(input.vendor_name),address=normalizeMeter(input.service_address??'');
 const ids=[...new Set([...suppliers.filter(s=>normalizeMeter(s.name)===name||(address&&normalizeMeter(s.address??'')===address)).map(s=>s.id),...aliases.filter(a=>normalizeMeter(a.alias)===name).map(a=>a.supplier_id)])];
 return ids.length===1?{kind:'company' as const,supplier_id:ids[0],account_id:null}:{kind:'question' as const};
}
export type UtilityStatement={current_charges:number|null;previous_balance?:number|null;payments_received?:number|null;amount_due?:number|null;deposit_held?:number|null;usage?:unknown;accounts?:{account_number:string;current_charges:number;service_period_start?:string;service_period_end?:string}[]};
export function statementCharges(statement:UtilityStatement){const amount=statement.accounts?.length?statement.accounts.reduce((n,a)=>n+a.current_charges,0):statement.current_charges;if(amount===null||!Number.isFinite(amount)||amount<0)throw new Error('What are this period’s current charges?');return amount;}
export function statementDifferences(statement:UtilityStatement,books:{previous_balance?:number;payments_received?:number;amount_due?:number;deposit_held?:number}){
 return (['previous_balance','payments_received','amount_due','deposit_held'] as const).filter(key=>statement[key]!=null&&(books[key]===undefined||Math.abs(Number(statement[key])-Number(books[key]))>.01));
}