export const settingsDestinations = [
  {id:'company',group:'Business',label:'Company & legal details',description:'Registered details, address and auditor',query:'tab=business&section=company'},
  {id:'venues',group:'Business',label:'Venues',description:'Seats, trading days, stock areas and location',query:'tab=business&section=venues'},
  {id:'users',group:'People & access',label:'Users & invites',description:'People, invitations and real access permissions',query:'tab=users'},
  {id:'approvals',group:'People & access',label:'Approval policy',description:'Who approves changes made by your team',query:'tab=users&view=approvals'},
  {id:'activity',group:'People & access',label:'Activity log',description:'Recorded changes and who made them',query:'tab=users&view=activity'},
  {id:'purchasing',group:'Operations',label:'Purchasing & sharing',description:'How you buy and share central costs',query:'tab=business&section=purchasing'},
  {id:'stock',group:'Operations',label:'Stock count reference',description:'Blind counts or the last approved count',query:'tab=business&section=stock'},
  {id:'team',group:'Operations',label:'Team working',description:'Company defaults and role-specific working arrangements',query:'tab=business&section=team'},
  {id:'sources',group:'Operations',label:'Sales sources',description:'Where sales come from',query:'tab=business&section=sources'},
  {id:'base',group:'Finance',label:'Base currency',description:'Reporting currency and its current lock',query:'tab=accounting&view=base'},
  {id:'books',group:'Finance',label:'Books start date',description:'The first date covered by your books',query:'tab=accounting&view=books'},
  {id:'schedule',group:'Finance',label:'Schedule setup',description:'Assets, stock and deferred revenue',query:'tab=accounting&view=schedule'},
  {id:'tax',group:'Finance',label:'Tax setup',description:'Year end, tax preparation and assessment dates',query:'tab=accounting&view=tax'},
  {id:'accounts',group:'Finance',label:'Chart of accounts',description:'Account names and codes in Books',query:'tab=accounting&view=accounts'},
  {id:'mappings',group:'Finance',label:'Category & account mappings',description:'Accounts used by bills, invoices and cash receipts',query:'tab=accounting&view=categories'},
  {id:'processors',group:'Finance',label:'Card processors',description:'Processors, merchants and fee rates',query:'tab=accounting&view=processors'},
  {id:'opening',group:'Finance',label:'Opening balances',description:'Starting supplier balances, credits and deposits',query:'tab=accounting&view=opening'},
  {id:'suppliers',group:'Master data',label:'Suppliers & vendors',description:'Directory, profiles and archived suppliers',query:'tab=master-data'},
  {id:'products',group:'Master data',label:'Products',description:'Product records and supplier links',query:'tab=master-data&md=products'},
  {id:'categories',group:'Master data',label:'Product categories',description:'Product groups and category review',query:'tab=master-data&md=categories'},
  {id:'bani',group:'Bani',label:'What Bani learned',description:'Find, inspect and forget learned information',query:'tab=bani'},
] as const;
export type SettingsDestination = typeof settingsDestinations[number]['id'];
export function settingsHref(id:SettingsDestination){return `/settings?${settingsDestinations.find(d=>d.id===id)?.query??''}`;}
export function visibleSettingsDestinations(admin:boolean,invoiceAccess:boolean){return settingsDestinations.filter(d=>admin||(invoiceAccess&&d.group==='Master data'));}
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
   return ['base','books','schedule','tax','accounts','processors','opening'].includes(view??'')?view as SettingsDestination:'base';
 }
 if(tab==='master-data')return params.get('md')==='products'?'products':params.get('md')==='categories'?'categories':'suppliers';
 return tab==='bani'?'bani':'denied';
}
export const venueSections=['seats','periods','closures','areas','location','accounts','status'] as const;
export function resolveVenueSection(params:URLSearchParams){const section=params.get('section');return venueSections.find(s=>s===section)??'seats';}