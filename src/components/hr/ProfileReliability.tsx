import {useEffect,useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {fetchAllRows} from '@/utils/fetchAllRows';
import {attendanceMetrics} from '@/utils/peopleAttendance';
import {formatDate,formatDecimal} from '@/utils/format';
import type {RotaRow} from '@/utils/peopleRota';
export function ProfileReliability({person,data,clockEnabled}:{person:RotaRow;data:RotaRow;clockEnabled:boolean}){
 const [attendance,setAttendance]=useState<RotaRow[]>([]),[swaps,setSwaps]=useState<RotaRow[]>([]),[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;if(!data.tenantId||!clockEnabled){setLoading(false);return;}Promise.all([fetchAllRows('hr_attendance','*',undefined,data.tenantId),fetchAllRows('hr_swap_requests','*',undefined,data.tenantId)]).then(([a,s])=>{if(active){setAttendance(a);setSwaps(s);setLoading(false);}}).catch(()=>{if(active)setLoading(false);});return()=>{active=false;};},[data.tenantId,clockEnabled]);
 const facts=attendanceMetrics(person,{shifts:data.shifts??[],attendance,swaps,today:data.today,terms:data.terms??[],requests:[],leave:[],ledger:[],holidays:[],payroll:[]});
 return <section className="border-t border-border pt-3 space-y-2"><h3 className="font-medium">Attendance</h3><p className="text-sm text-muted-foreground">Last 8 weeks</p>{loading?<p>Loading attendance…</p>:!facts.coverage?<><p className="text-sm">No rota or clock-in</p><p className="text-xs text-muted-foreground">Last rota: {facts.lastRota?formatDate(facts.lastRota):'not recorded'}</p></>:<dl className="grid grid-cols-2 gap-2 text-sm"><dt>Late</dt><dd>{formatDecimal(facts.late,0)}</dd><dt>No-shows / no clock-in</dt><dd>{formatDecimal(facts.noShows,0)}</dd><dt>Left early</dt><dd>{formatDecimal(facts.early,0)}</dd><dt>Covered a shift</dt><dd>{formatDecimal(facts.covered,0)}</dd></dl>}</section>;
}