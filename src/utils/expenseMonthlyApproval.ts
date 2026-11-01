export type MonthlyDraft={id:string;kind:'accrual'|'bill'|'prepaid'|'schedule';name:string;amount:number;estimate?:boolean;note?:string;blocked?:boolean};
export function selectedMonthlyDrafts(rows:MonthlyDraft[],checked:Record<string,boolean>){return rows.filter(r=>checked[r.id]&&!r.blocked).map(r=>({id:r.id,kind:r.kind}));}
export async function approveSelectedDrafts(rows:MonthlyDraft[],checked:Record<string,boolean>,post:(items:{id:string;kind:string}[])=>Promise<void>){const items=selectedMonthlyDrafts(rows,checked);if(items.length)await post(items);return items.length;}
