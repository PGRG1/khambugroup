import {useEffect,useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {fetchAllRows} from '@/utils/fetchAllRows';
import {profileReliability} from '@/utils/peoplePayroll';
import {formatDate,formatDecimal} from '@/utils/format';
import type {RotaRow} from '@/utils/peopleRota';
export function ProfileReliability({person,data,clockEnabled}:{person:RotaRow;data:RotaRow;clockEnabled:boolean}){
 const [attendance,setAttendance]=useState<RotaRow[]>([]),[swaps,setSwaps]=useState<RotaRow[]>([]),[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;if(!data.tenantId||!clockEnabled){setLoading(false);return;}Promise.all([fetchAllRows('hr_attendance','*',undefined,data.tenantId),fetchAllRows('hr_swap_requests','*',undefined,data.tenantId)]).then(([a,s])=>{if(active){setAttendance(a);setSwaps(s);setLoading(false);}}).catch(()=>{if(active)setLoading(false);});return()=>{active=false;};},[data.tenantId,clockEnabled]);
 const facts=profileReliability(person,data.terms,data.shifts,attendance,swaps,data.today,clockEnabled);
 return <section className="border-t border-border pt-3 space-y-2"><h3 className="font-medium">Reliability</h3><p className="text-sm text-muted-foreground">Last 8 weeks, from rota and clock-ins</p>{loading?<p>Loading attendance…</p>:<>{facts.unknown&&<p className="text-sm text-muted-foreground">Not enough data{!clockEnabled?' · clock-ins are off': ' · clock-ins are missing'}.</p>}<dl className="grid grid-cols-2 gap-2 text-sm"><dt>On time</dt><dd>{clockEnabled?`${facts.onTime} of ${facts.recorded} recorded shifts`:'—'}</dd><dt>Recorded no-shows</dt><dd>{facts.noShows??'—'}</dd><dt>Covered for others</dt><dd>{clockEnabled?facts.covered:'—'}</dd><dt>Rota hours vs contract</dt><dd>{formatDecimal(facts.planned,1)} / {facts.contract==null?'unknown':formatDecimal(facts.contract,1)} h</dd></dl>{clockEnabled&&facts.late.map(l=><p className="text-sm text-muted-foreground" key={l.date}>{formatDate(l.date)} · {l.minutes} minutes late</p>)}</>}</section>;
}