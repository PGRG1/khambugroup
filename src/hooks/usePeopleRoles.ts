import {useEffect,useState} from 'react';
import {useActiveTenant} from '@/hooks/useActiveTenant';
import {fetchAllRows} from '@/utils/fetchAllRows';
export function usePeopleRoles(){const {tenantId}=useActiveTenant();const [map,setMap]=useState<Record<string,string>>({});useEffect(()=>{let active=true;if(!tenantId){setMap({});return;}fetchAllRows('hr_role_groups','*',undefined,tenantId).then(rows=>{if(active)setMap(Object.fromEntries(rows.flatMap(r=>(r.titles??[]).map((title:string)=>[title.toLowerCase().replace(/[^a-z]+/g,' ').trim(),r.name]))));});return()=>{active=false;};},[tenantId]);return map;}
