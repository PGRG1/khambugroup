export const notificationPreferenceTool={type:'function',function:{name:'notification_preferences',description:'Only on explicit user instructions: remember a plain-language notification preference using an existing event; list what the user has told Bani; forget a specified saved preference. Never silently create rules. If no event matches, ask which recorded event. A named person must match an existing authorised role, otherwise explain that individual routing is not yet available.',parameters:{type:'object',properties:{operation:{type:'string',enum:['list','remember','forget']},event_id:{type:'string'},preference_id:{type:'string'},scope:{type:'string',enum:['off','until','summary_only','bigger_only','route_to_role']},until_date:{type:'string',description:'YYYY-MM-DD; clarify ambiguous date'},threshold:{type:'number'},target_role:{type:'string'},reason:{type:'string',description:'Exact plain-language instruction the user gave'}},required:['operation'],additionalProperties:false}}};
export async function notificationPreferences(args:any,client:any,tenantId:string,userId:string){
 if(args.operation==='list'){
  const [mutes,asks,events]=await Promise.all([client.from('alert_mutes').select('id,reason,scope,until_date,target_role').eq('tenant_id',tenantId).eq('created_by',userId).eq('active',true),client.from('alert_asks').select('id,title,enabled').eq('tenant_id',tenantId).eq('created_by',userId),client.from('alert_events').select('id,title,kind,venue_id').eq('tenant_id',tenantId).in('status',['open','summary'])]);
  if(mutes.error||asks.error||events.error)throw new Error('Could not read your preferences');return {preferences:mutes.data,asks:asks.data,events:events.data};
 }
 if(args.operation==='forget'){
  const {data:m,error}=await client.from('alert_mutes').select('id').eq('tenant_id',tenantId).eq('id',args.preference_id).eq('created_by',userId).maybeSingle();if(error)throw error;
  if(m){const {error}=await client.rpc('smart_alert_unmute',{t:tenantId,ident:m.id});if(error)throw error;return {message:'Forgot that preference.'};}
  const {data:a}=await client.from('alert_asks').select('id').eq('tenant_id',tenantId).eq('id',args.preference_id).eq('created_by',userId).maybeSingle();if(!a)throw new Error('Your preference was not found');const result=await client.rpc('smart_alert_toggle_ask',{t:tenantId,ident:a.id,on_off:false});if(result.error)throw result.error;return {message:'Stopped that ask.'};
 }
 if(args.operation==='remember'){
  if(typeof args.reason!=='string'||!args.reason.trim()||!args.event_id)throw new Error('Choose the event and tell me the exact instruction.');
  const {error}=await client.rpc('smart_alert_action',{t:tenantId,ident:args.event_id,decision:'mute',options:{scope:args.scope,until_date:args.until_date,threshold:args.threshold,target_role:args.target_role,reason:args.reason}});if(error)throw error;return {message:'Remembered your instruction.'};
 }
 throw new Error('Unknown preference action');
}