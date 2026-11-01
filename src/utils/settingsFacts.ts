export const settingsTabs = ['Business','Users','Accounting','Bani','Alerts'] as const;
export const approvalWords: Record<string,string> = {
 owner_run: "Owner's changes count straight away; others wait for the owner",
 managed: "Managers' changes need the owner",
 strict: "A second person must approve, never the author",
};
export function tenantMemberUsers<T extends {user_id:string}>(users:T[],members:{user_id:string}[]) { const ids=new Set(members.map(m=>m.user_id));return users.filter(u=>ids.has(u.user_id)); }
export function categorySuggestion(name:string,accounts:{id:string;code:string;is_active?:boolean}[]) {
 const code:Record<string,string>={food:'5110',beverages:'5100',packaging:'5120',cleaning:'6100',other:'6090'};
 const target=code[name.trim().toLowerCase()];return target?accounts.find(a=>a.code===target&&a.is_active!==false):undefined;
}
export function learnedWords(value:unknown):string {if(value===null||value===undefined)return 'Not recorded';if(typeof value!=='object')return String(value);return Object.entries(value as Record<string,unknown>).map(([key,v])=>`${key.replace(/_/g,' ')}: ${typeof v==='object'?learnedWords(v):String(v)}`).join(' · ');}
