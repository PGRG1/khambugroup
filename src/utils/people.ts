export const peopleDefaults = {rota:true,clock_in:'off',pay_hours:'rota',leave_requests:true,sick_notes:true,staff_app:false,payslips:false,managers_change_pay:true,reliability:true,approvals:'owner_run'};
export type PeopleSettings=typeof peopleDefaults;
export function resolvePeopleSettings(company:Partial<PeopleSettings>={},venue:Partial<PeopleSettings>={}):PeopleSettings {const result={...peopleDefaults,...company,...venue};if(!result.staff_app)result.payslips=false;return result;}
export interface EmploymentTerms {id?:string;effective_date:string;values:Record<string,unknown>;approved_at?:string|null}
export function termsOnDate(rows:EmploymentTerms[],date:string):Record<string,unknown> {return rows.filter(r=>r.effective_date<=date).sort((a,b)=>a.effective_date.localeCompare(b.effective_date)||(a.approved_at??'').localeCompare(b.approved_at??'')||(a.id??'').localeCompare(b.id??'')).reduce((v,r)=>({...v,...r.values}),{});}
export function needsOwnerApproval(mode:string,owner:boolean){return mode!=='owner_run'||!owner;}
export function canApprovePeople(mode:string,owner:boolean,author:string,approver:string){return owner&&(mode!=='strict'||author!==approver);}
export function documentExpiryDue(expiry:string|null,today:string){if(!expiry)return false;return (Date.parse(expiry)-Date.parse(today))/86400000<=60;}
export function workingPerson(status:string,hireDate:string,today:string,endDate?:string|null){return ['active','on_leave'].includes(status)&&hireDate<=today&&(!endDate||endDate>today);}
export function monthlyDatedPay(rows:EmploymentTerms[],year:number,month:number,hoursByDay:Record<string,number>={}):number|null {
 const days=new Date(Date.UTC(year,month,0)).getUTCDate();let total=0,known=false;
 for(let d=1;d<=days;d++){const date=`${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;const t=termsOnDate(rows,date);if(t.pay_amount==null)continue;known=true;if(t.hire_date&&String(t.hire_date)>date||t.end_date&&String(t.end_date)<=date)continue;total+=t.pay_basis==='hour'?Number(t.pay_amount)*(hoursByDay[date]??0):Number(t.pay_amount)/days;}return known?total:null;
}
export function datedLeaveAccrual(rows:EmploymentTerms[],start:string,end:string):number|null {let total=0,known=false;for(let d=Date.parse(start);d<=Date.parse(end);d+=86400000){const date=new Date(d).toISOString().slice(0,10),t=termsOnDate(rows,date);if(t.annual_leave==null)continue;known=true;if(t.hire_date&&String(t.hire_date)>date||t.end_date&&String(t.end_date)<=date)continue;const year=new Date(d).getUTCFullYear();const days=(Date.UTC(year+1,0,1)-Date.UTC(year,0,1))/86400000;total+=Number(t.annual_leave)/days;}return known?total:null;}
export function preserveEarnedPay(saved:boolean,override:number|null,earned:number){return override??(saved?null:earned);}
