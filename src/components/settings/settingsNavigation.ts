export const settingsGroups = ['Business', 'People & access', 'Operations', 'Finance', 'Master data', 'Bani'] as const;
export const settingsDestinations = [
  {key:'company',group:'Business',label:'Company & legal details',description:'Registered companies, addresses and legal information.'},
  {key:'venues',group:'Business',label:'Venues',description:'Seats, trading periods, closures and venue setup.'},
  {key:'users',group:'People & access',label:'Users & invites',description:'Invite people and manage their existing access.'},
  {key:'approvals',group:'People & access',label:'Approval policy',description:'Who reviews and confirms changes.'},
  {key:'activity',group:'People & access',label:'Activity log',description:'Review recorded changes and actions.'},
  {key:'purchasing',group:'Operations',label:'Purchasing & sharing',description:'How venues buy and share central costs.'},
  {key:'stock-reference',group:'Operations',label:'Stock count reference',description:'Blind counts or the last approved count.'},
  {key:'team-working',group:'Operations',label:'Team working',description:'Company defaults and working arrangements by role.'},
  {key:'sales-sources',group:'Operations',label:'Sales sources',description:'Maintain the sources your sales come from.'},
  {key:'currency',group:'Finance',label:'Base currency',description:'The currency used in your books.'},
  {key:'books-start',group:'Finance',label:'Books start date',description:'The first date covered by your books.'},
  {key:'schedule',group:'Finance',label:'Schedule setup',description:'Assets, prepayments, vouchers and stock basis.'},
  {key:'tax',group:'Finance',label:'Tax setup',description:'Financial year, business type and assessment dates.'},
  {key:'accounts',group:'Finance',label:'Chart of accounts',description:'Account names and codes in Finance Books.'},
  {key:'mappings',group:'Finance',label:'Category & account mappings',description:'Accounts used by bills, invoices and cash receipts.'},
  {key:'processors',group:'Finance',label:'Card processors',description:'Processors, merchants and fee rates.'},
  {key:'opening',group:'Finance',label:'Opening balances',description:'Starting supplier balances, credits and deposits.'},
  {key:'suppliers',group:'Master data',label:'Suppliers & vendors',description:'Your shared directory and supplier profiles.'},
  {key:'products',group:'Master data',label:'Products',description:'Product records and supplier-specific information.'},
  {key:'product-categories',group:'Master data',label:'Product categories',description:'Product groups and category structure.'},
  {key:'learning',group:'Bani',label:'What Bani learned',description:'Review learned information and forget it with confirmation.'},
] as const;
export type SettingsDestination = typeof settingsDestinations[number]['key'];
export const venueSections = [
  ['seats','Seats'],['periods','Service periods'],['closures','Closures'],['stock','Stock areas'],
  ['location','Location'],['accounts','Account mapping'],['status','Status'],
] as const;
export type VenueSection = typeof venueSections[number][0];
export function resolveSettingsDestination(params:URLSearchParams): SettingsDestination | 'overview' | 'invalid' {
  const destination=params.get('destination');
  if(destination) return settingsDestinations.some(d=>d.key===destination)?destination as SettingsDestination:'invalid';
  const tab=params.get('tab'),view=params.get('view');
  if(!tab)return 'overview';
  if(tab==='business')return params.get('venue')||params.get('section')==='accounts'?'venues':'company';
  if(tab==='users')return view==='activity'?'activity':view==='approvals'?'approvals':'users';
  if(tab==='accounting')return view==='categories'?'mappings':['processors','merchants','fee-rates'].includes(view??'')?'processors':view==='opening'?'opening':'currency';
  if(tab==='master-data')return params.get('md')==='products'?'products':params.get('md')==='categories'?'product-categories':'suppliers';
  if(tab==='bani')return 'learning';
  return 'invalid';
}
export function settingsHref(destination:SettingsDestination,venueId?:string,section?:VenueSection){
  const params=new URLSearchParams({destination});
  if(venueId)params.set('venue',venueId);
  if(section)params.set('section',section);
  return `/settings?${params}`;
}
export function resolveVenueSection(params:URLSearchParams):VenueSection {
  const section=params.get('section');
  return venueSections.some(([key])=>key===section)?section as VenueSection:'seats';
}
/** Retains Settings' existing admin/preview and invoice-access boundary. */
export function availableSettingsDestinations(admin:boolean,invoiceAccess:boolean){
  return settingsDestinations.filter(d=>admin||invoiceAccess&&d.group==='Master data');
}