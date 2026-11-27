export interface DirectorySupplier { id:string; name:string; directory_merged_into:string|null; is_active:boolean; contact_person:string|null; email:string|null; phone:string|null; address:string|null; payment_terms:string|null; delivery_days:string[]; notes:string|null; created_at?:string|null; }
export interface DirectoryInvoice { id:string; supplier_id:string|null; date:string; number:string|null; total:number; kind:'stock'|'expense'; categories:string[]; }
/** Archived = switched off, or never billed and added over 90 days ago. A new supplier stays active until its first invoice. */
export function isArchived(s:{is_active:boolean;created_at?:string|null},records:number,today=new Date().toISOString().slice(0,10)){
 if(s.is_active===false)return true;
 if(records>0)return false;
 if(!s.created_at)return true;
 return Date.parse(today)-Date.parse(s.created_at.slice(0,10))>90*86400000;
}
export function directoryRows(suppliers:DirectorySupplier[],invoices:DirectoryInvoice[],year:string){
 return suppliers.filter(s=>!s.directory_merged_into).map(s=>{const ids=new Set([s.id,...suppliers.filter(a=>a.directory_merged_into===s.id).map(a=>a.id)]);const records=invoices.filter(i=>i.supplier_id&&ids.has(i.supplier_id));return {...s,ids,records,archived:isArchived(s,records.length),lastInvoice:records.map(i=>i.date).sort().at(-1)??null,thisYear:records.filter(i=>i.date.startsWith(year)).length,categories:[...new Set(records.flatMap(i=>i.categories))].sort()};}).sort((a,b)=>a.name.localeCompare(b.name));
}
export function directoryDuplicates(suppliers:{id:string;name:string}[]){
 const normalize=(s:string)=>s.toLowerCase().replace(/\b(limited|ltd|hong kong|hk|company|co)\b/g,'').replace(/[^a-z0-9]/g,'');
 return suppliers.flatMap((a,index)=>suppliers.slice(index+1).filter(b=>{const x=normalize(a.name),y=normalize(b.name);return x.length>=3&&y.length>=3&&(x===y||x.startsWith(y)||y.startsWith(x));}).map(b=>({from:a,into:b})));
}