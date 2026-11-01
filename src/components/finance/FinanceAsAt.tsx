import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {formatDate} from '@/utils/format';
import {tenantToday} from '@/utils/salesRecordChecks';
export function FinanceAsAt({value,onChange,dates}:{value:string;onChange:(v:string)=>void;dates:string[]}){const options=[...new Set([tenantToday(),value,...dates.filter(Boolean).map(d=>{const n=new Date(d.slice(0,7)+'-01T00:00:00Z');n.setUTCMonth(n.getUTCMonth()+1);n.setUTCDate(0);return n.toISOString().slice(0,10);})])].sort().reverse();return <Select value={value} onValueChange={onChange}><SelectTrigger className="w-52" aria-label="As at"><SelectValue/></SelectTrigger><SelectContent>{options.map(d=><SelectItem key={d} value={d}>As at {formatDate(d)}</SelectItem>)}</SelectContent></Select>;}
