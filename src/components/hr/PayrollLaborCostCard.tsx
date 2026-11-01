import {useEffect,useState} from 'react';
import {useActiveTenant} from '@/hooks/useActiveTenant';
import {fetchAllRows} from '@/utils/fetchAllRows';
import {monthStaffCost} from '@/utils/peoplePresentation';
import {formatMenuCurrency,formatPercent,formatMonthLabel} from '@/utils/format';
export function PayrollLaborCostCard({year,month}:{year:number;month:number}){const {tenantId}=useActiveTenant();const [fact,setFact]=useState<ReturnType<typeof monthStaffCost>|null>(null);const key=`${year}-${String(month).padStart(2,'0')}`;useEffect(()=>{if(!tenantId)return;let active=true;Promise.all([fetchAllRows('hr_payroll','*',undefined,tenantId),fetchAllRows('sales_records','date,total_sales',undefined,tenantId)]).then(([p,s])=>{if(active)setFact(monthStaffCost(p,s,key));});return()=>{active=false;};},[tenantId,key]);return <section className="border-t border-border py-4"><h3 className="font-medium">KHAMBU staff cost · {formatMonthLabel(key)}</h3><p className="td-num text-sm mt-2">{fact?.cost==null?'Payroll missing':`${formatMenuCurrency(fact.cost)} · ${formatPercent(fact.percent)} of total sales`}</p></section>;}
