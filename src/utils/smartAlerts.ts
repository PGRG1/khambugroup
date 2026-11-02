export type {Candidate} from '../../supabase/functions/evaluate-alerts/rules';
export {salesBaseline,salesChange,median,priceIncrease,muteMatches,isSuppressed,alertKey,lifecycle} from '../../supabase/functions/evaluate-alerts/rules';
export interface SmartAlert {id:string;kind:string;subject:string;status:'open'|'done'|'muted';severity:string;area:string;venue_id:string|null;title:string;why:string;baseline:number|null;actual:number|null;action_path:string;fired_for_date:string;created_at:string;closed_by:string|null;payload:Record<string,any>}
export interface AlertMute {id:string;kind:string|null;area:string|null;venue_id:string|null;scope:string;threshold:number|null;until_date:string|null;target_role:string|null;reason:string;created_by:string;active:boolean}
export const areaPage=(area:string)=>area==='sales'?'revenue':area;
export const sortAlerts=(rows:SmartAlert[])=>[...rows].sort((a,b)=>Number(!!b.payload.question)-Number(!!a.payload.question)||(['urgent','normal','info'].indexOf(a.severity)-['urgent','normal','info'].indexOf(b.severity))||b.created_at.localeCompare(a.created_at));
export const actionLabel=(area:string)=>({sales:'Open sales day',expenses:'Open bill',bank:'Open bank',payments:'Open payouts',procurement:'Open purchases',finance:'Open books'}[area]??'Open record');
export const muteLabel=(m:AlertMute)=>({bigger_only:`Only if bigger (${m.threshold??60}%)`,until:'Paused for this venue',summary_only:'Daily summary only',route_to_role:`Routed to ${m.target_role??'another role'}`,off:'This kind is off'}[m.scope]??m.scope);
