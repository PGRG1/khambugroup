import {useEffect,useState,useCallback} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {useActiveTenant} from '@/hooks/useActiveTenant';
import {resolvePeopleSettings,type PeopleSettings} from '@/utils/people';
import {useAuth} from '@/hooks/useAuth';
import {usePreviewMode} from '@/hooks/usePreviewMode';
import {fetchAllRows} from '@/utils/fetchAllRows';
export function usePeopleSettings(){const {tenantId}=useActiveTenant();const [rows,setRows]=useState<{venue_id:string|null;values:Partial<PeopleSettings>}[]>([]);const [loading,setLoading]=useState(true);
 const {isAdmin}=useAuth();const {isPreviewActive}=usePreviewMode();const [facts,setFacts]=useState<{venues:any[];shifts:any[];attendance:any[]}>({venues:[],shifts:[],attendance:[]});
 const reload=useCallback(async()=>{if(!tenantId){setRows([]);setFacts({venues:[],shifts:[],attendance:[]});setLoading(false);return;}const [settings,venues,shifts,attendance]=await Promise.all([fetchAllRows('people_settings','venue_id,values',undefined,tenantId),fetchAllRows('venues','id,latitude,longitude',undefined,tenantId),fetchAllRows('hr_shifts','venue_id',undefined,tenantId),fetchAllRows('hr_attendance','venue_id,clock_in',undefined,tenantId)]);setRows(settings as typeof rows);setFacts({venues,shifts,attendance:attendance.filter(a=>a.clock_in)});setLoading(false);},[tenantId]);
 useEffect(()=>{reload();window.addEventListener('people-settings-changed',reload);return()=>window.removeEventListener('people-settings-changed',reload);},[reload]);
 const company=rows.find(r=>r.venue_id===null)?.values??{};
 return {rows,loading,reload,company,forVenue:(id?:string|null)=>resolvePeopleSettings(company,rows.find(r=>r.venue_id===id)?.values??{},{isAdmin:isAdmin&&!isPreviewActive,hasShifts:facts.shifts.some(s=>!id||s.venue_id===id),hasLocation:facts.venues.some(v=>v.id===id&&v.latitude!==null&&v.longitude!==null),hasAttendance:facts.attendance.some(a=>!id||a.venue_id===id)})};
}