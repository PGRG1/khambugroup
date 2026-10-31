export type FinancialDocument = { id: string; sourceId: string; name: string; type: string; date: string; record: string; link: string; bucket: string; path: string; venue?: string | null; venueId?: string | null };
export const documentSources = [
  {table:'invoices',type:'Supplier invoice',bucket:'invoice-files',paths:['file_url'],name:'file_name',date:'created_at',record:'invoice_number',link:(r:any)=>`/procurement/invoices?invoice=${r.id}`},
  {table:'invoice_attachments',type:'Supplier invoice',bucket:'invoice-files',paths:['path'],name:'original_name',date:'attached_at',record:'invoice_id',link:(r:any)=>`/procurement/invoices?invoice=${r.invoice_id}`},
  {table:'expense_bills',type:'Bill or receipt',bucket:'bill-attachments',paths:['attachment_path','attachment_url'],name:'bill_number',date:'created_at',record:'vendor_name',link:(r:any)=>`/expenses?bill=${r.id}`},
  {table:'sales_records',type:'Z report',bucket:'sales-receipts',paths:['receipt_file_url'],name:'receipt_file_name',date:'created_at',record:'report_number',link:(r:any)=>`/sales-data/${r.id}`},
  {table:'sales_receipt_intakes',type:'Sales scan',bucket:'sales-receipt-intake',paths:['source_path'],name:'source_name',date:'created_at',record:'status',link:(r:any)=>r.posted_record_id?`/sales-data/${r.posted_record_id}`:'/sales-data?view=daily'},
  {table:'bank_statement_imports',type:'Bank statement',bucket:'bank-statements',paths:['file_url'],name:'file_name',date:'uploaded_at',record:'period_start',link:()=>'/finance/cash?view=transactions'},
  {table:'payment_settlement_imports',type:'Settlement statement',bucket:'payment-statements',paths:['file_url'],name:'file_name',date:'uploaded_at',record:'period_start',link:()=>'/finance/receivables?view=payouts'},
  {table:'staff_reimbursements',type:'Staff claim receipt',bucket:'petty-cash-receipts',paths:['receipt_path','receipt_url'],name:'description',date:'created_at',record:'claimant_name',link:()=>'/expenses/claims'},
  {table:'petty_cash_receipts',type:'Cash-box receipt',bucket:'petty-cash-receipts',paths:['receipt_path','receipt_url'],name:'description',date:'created_at',record:'receipt_date',link:()=>'/expenses?type=cash'},
  {table:'hr_person_documents',type:'Contract',bucket:'hr-private-documents',paths:['storage_path'],name:'file_name',date:'created_at',record:'employee_id',link:(r:any)=>`/hr/employees/${r.employee_id}`},
];
export function storedPath(value:string,bucket:string) {
  if(!/^https?:/i.test(value)) return value;
  try { const url=new URL(value); const marker=`/storage/v1/object/`; const pos=url.pathname.indexOf(marker); if(pos<0)return null; const parts=url.pathname.slice(pos+marker.length).split('/'); if(!['public','sign','authenticated'].includes(parts[0])||parts[1]!==bucket)return null; return decodeURIComponent(parts.slice(2).join('/')); }catch{return null;}
}
export function indexDocuments(table:string,rows:any[]):FinancialDocument[] {
 const config=documentSources.find(s=>s.table===table);if(!config)return [];
 return rows.flatMap(r=>{if(table==='hr_person_documents'&&r.kind!=='contract')return [];const value=config.paths.map(k=>r[k]).find(Boolean);if(typeof value!=='string')return [];return value.split(',').map((p,i)=>({id:`${table}:${r.id}:${i}`,sourceId:r.invoice_id??r.id,name:r[config.name]||p.split('/').pop()||config.type,type:config.type,date:r[config.date]??'',record:String(r[config.record]??config.type),link:config.link(r),bucket:r.bucket??config.bucket,path:p.trim(),venue:r.venue,venueId:r.venue_id}));});
}
