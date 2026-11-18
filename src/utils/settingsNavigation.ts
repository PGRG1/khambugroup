export const settingsDestinations = [
  {id:'company',group:'Business',label:'Company & legal details',description:'Registered details, address and auditor',query:'tab=business&section=company'},
  {id:'venues',group:'Business',label:'Venues',description:'Seats, service periods, closures, stock areas and location',query:'tab=business&section=venues'},
  {id:'sources',group:'Business',label:'Sales sources',description:'Where sales come from',query:'tab=business&section=sources'},
  {id:'users',group:'Team & access',label:'People & access',description:'People, invitations and what each can see and change',query:'tab=users'},
  {id:'approvals',group:'Team & access',label:'Approval policy',description:'Who approves changes made by your team',query:'tab=users&view=approvals'},
  {id:'team',group:'Team & access',label:'Team working',description:'Company defaults and role-specific working arrangements',query:'tab=business&section=team'},
  {id:'activity',group:'Team & access',label:'Activity log',description:'Who changed what, and when',query:'tab=users&view=activity'},
  {id:'purchasing',group:'Buying & stock',label:'How you buy',description:'Buying by venue or centrally, and how central costs are shared',query:'tab=business&section=purchasing'},
  {id:'stock',group:'Buying & stock',label:'Stock counts',description:'Blind counts or show the last approved count',query:'tab=business&section=stock'},
  {id:'base',group:'Finance',label:'Base currency',description:'Reporting currency and its current lock',query:'tab=accounting&view=base'},
  {id:'books',group:'Money',label:'Books start',description:'The first day covered by your books',query:'tab=accounting&view=books'},
  {id:'schedule',group:'Finance',label:'Schedule setup',description:'Assets, stock and deferred revenue',query:'tab=accounting&view=schedule'},
  {id:'tax',group:'Finance',label:'Tax setup',description:'Year end, tax preparation and assessment dates',query:'tab=accounting&view=tax'},
  {id:'accounts',group:'Finance',label:'Chart of accounts',description:'Account names and codes in Books',query:'tab=accounting&view=accounts'},
  {id:'mappings',group:'Finance',label:'Category & account mappings',description:'Accounts used by bills, invoices and cash receipts',query:'tab=accounting&view=categories'},
  {id:'processors',group:'Money',label:'Card processors',description:'Processors, merchants and fee rates',query:'tab=accounting&view=processors'},
  {id:'opening',group:'Money',label:'Opening balances',description:'Starting supplier balances, credits and deposits',query:'tab=accounting&view=opening'},
  {id:'suppliers',group:'Lists',label:'Suppliers',description:'Directory, profiles and archived suppliers',query:'tab=master-data'},
  {id:'products',group:'Lists',label:'Products',description:'Product records and supplier links',query:'tab=master-data&md=products'},
  {id:'categories',group:'Lists',label:'Product categories',description:'Product groups and category review',query:'tab=master-data&md=categories'},
  {id:'bani',group:'Bani',label:'What Bani learned',description:'Find, inspect and forget what your team taught Bani',query:'tab=bani'},
] as const;
export type SettingsDestination = typeof settingsDestinations[number]['id'];
/** Accounting lives in one place: Finance › Accounting. These destinations open there instead of Settings. */
export const movedToAccounting: Partial<Record<SettingsDestination,string>> = {
  base:'/finance/books?view=currencies',
  schedule:'/finance/books?view=schedules',
  tax:'/finance/books?view=tax',
  accounts:'/finance/books?view=chart-of-accounts',
  mappings:'/finance/books?view=chart-of-accounts',
};
export function settingsHref(id:SettingsDestination){return `/settings?${settingsDestinations.find(d=>d.id===id)?.query??''}`;}
export function visibleSettingsDestinations(admin:boolean,invoiceAccess:boolean){return settingsDestinations.filter(d=>!movedToAccounting[d.id]&&(admin||(invoiceAccess&&d.group==='Lists')));}
export function resolveSettingsDestination(params:URLSearchParams):SettingsDestination|'overview'|'denied'{
 const tab=params.get('tab');const section=params.get('section');const view=params.get('view');
 if(!tab)return 'overview';
 if(tab==='business'){
   if(params.has('venue')||section==='accounts')return 'venues';
   return ['company','venues','purchasing','stock','team','sources'].includes(section??'')?section as SettingsDestination:'company';
 }
 if(tab==='users')return view==='activity'?'activity':view==='approvals'?'approvals':'users';
 if(tab==='accounting'){
   if(view==='categories')return 'mappings';
   if(view==='merchants'||view==='fee-rates')return 'processors';
   return ['base','books','schedule','tax','accounts','processors','opening'].includes(view??'')?view as SettingsDestination:'books';
 }
 if(tab==='master-data')return params.get('md')==='products'?'products':params.get('md')==='categories'?'categories':'suppliers';
 return tab==='bani'?'bani':'denied';
}
export const venueSections=['seats','periods','closures','areas','location','accounts','status'] as const;
/** Group order on the Settings overview. */
export const settingsGroups=['Business','Team & access','Buying & stock','Money','Lists','Bani'] as const;
export function resolveVenueSection(params:URLSearchParams){const section=params.get('section');return venueSections.find(s=>s===section)??'seats';}