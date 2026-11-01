import {useEffect,useState} from 'react';
import {useAuth} from '@/hooks/useAuth';
import {useActiveTenant} from '@/hooks/useActiveTenant';
export function usePeopleGrouping(owner:boolean,loading:boolean){const {user}=useAuth(),{tenantId}=useActiveTenant();const key=`people-group:${tenantId}:${user?.id}`;const [group,setGroup]=useState<'Role'|'Venue'>('Venue');useEffect(()=>{if(loading)return;try{const value=localStorage.getItem(key);setGroup(value==='Role'||value==='Venue'?value:owner?'Role':'Venue');}catch{setGroup(owner?'Role':'Venue');}},[key,owner,loading]);return [group,(value:'Role'|'Venue')=>{setGroup(value);try{localStorage.setItem(key,value);}catch{}}] as const;}
