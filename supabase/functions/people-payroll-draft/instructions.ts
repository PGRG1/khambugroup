type Row = Record<string, any>;
export function payrollInstruction(text:string, people:Row[], year:number, month:number) {
 const empty=(answer:string)=>({answer,changes:[] as Row[],year,month});
 const instruction=text.trim(), lower=instruction.toLowerCase();
 if(/\b(suggest|recommend|should|deserve|fair|appropriate|how much|what.*(?:raise|bonus|cut))\b/i.test(instruction))return empty('I do not recommend pay amounts. What exact pay instruction would you like carried out?');
 if(/^(?:why|what|how|show|list|calculate|check|tell)\b/i.test(instruction)||!/\b(give|add|extra|bonus|deduct|cut|reduce|increase|raise|set|change|pay|hours)\b/i.test(instruction))return empty(`Recorded net pay for the selected month: ${people.reduce((n,p)=>n+Number(p.net_salary??0),0)} HK dollars. ${people.filter(p=>p.preparation?.missing?.length).length} people have missing inputs.`);
 const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
 const mentioned=months.flatMap((m,i)=>new RegExp(`\\b(?:${m}|${m.slice(0,3)})\\b`,'i').test(instruction)?[i+1]:[]);
 const numericMonths=[...instruction.matchAll(/\b(20\d{2})-(0?[1-9]|1[0-2])\b/g)];
 const years=[...instruction.matchAll(/\b(20\d{2})\b/g)].map(m=>Number(m[1]));
 if(/\b(last|next) month\b/i.test(instruction)||mentioned.some(m=>m!==month)||numericMonths.some(m=>Number(m[1])!==year||Number(m[2])!==month)||years.some(y=>y!==year)||new Set(mentioned).size>1)return empty('Which month do you mean? Open that payroll month, then give the instruction there.');
 const normalized=(s:string)=>s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 const words=` ${normalized(instruction)} `;
 const full=people.filter(p=>words.includes(` ${normalized(p.name)} `));
 const candidates=full.length?full:people.filter(p=>normalized(p.name).split(' ').some((w:string)=>w.length>1&&words.includes(` ${w} `)));
 if(candidates.length!==1)return empty(candidates.length?'That name matches more than one person. What is their full name?':'Who is this for? Please give a full name from this month’s payroll.');
 const person=candidates[0];
 const amountMatches=[...instruction.matchAll(/(?:HK\s*\$\s*|HKD\s*|\$\s*)(\d[\d,]*(?:\.\d{1,2})?)|(\d[\d,]*(?:\.\d{1,2})?)\s*(?:HKD|dollars?|extra|bonus|hours?)\b/gi)];
 // An unlabelled number is accepted only when it is the sole number outside an explicit date/year.
 const stripped=instruction.replace(/\b20\d{2}(?:-(?:0?[1-9]|1[0-2]))?\b/g,'');
 const raw=[...stripped.matchAll(/\b\d[\d,]*(?:\.\d{1,2})?\b/g)];
 if(amountMatches.length!==1&&(amountMatches.length!==0||raw.length!==1))return empty('What exact amount or monthly hours should change? Please give one amount for one person.');
 const amount=Number((amountMatches[0]?.[1]??amountMatches[0]?.[2]??raw[0]?.[0]??'').replace(/,/g,''));
 if(/(?:HK\s*\$|\$|HKD)\s*-\s*\d|-\s*\d/.test(instruction))return empty('Please state whether this is an addition or deduction, with a positive amount.');
 if(!Number.isFinite(amount)||amount<0||amount>10000000||/\b(percent|percentage)\b|%/.test(lower))return empty('Please give the exact amount in HK dollars, or exact typed monthly hours.');
 const hours=/\bhours?\b/i.test(instruction), base=/\b(base|basic|earned)\s*(pay|salary)?\b/i.test(instruction), bonus=/\bbonus\b/i.test(instruction), cut=/\b(deduct|cut|reduce|subtract)\b/i.test(instruction);
 if(hours&&person.preparation?.source!=='typed_monthly')return empty('Hours for pay come from the rota. Which rota shift needs its hours edited?');
 if(/\b(overtime|OT|net|rate|contract|raise|salary increase)\b/i.test(instruction)&&!base)return empty('Which pay line should change, and is the amount an addition, deduction, or a new total?');
 const field=hours?'forecast_allowances':base?'earned_salary_override':bonus?'actual_bonus':'adjustments_override';
 const set=/\b(set|to|total|make)\b/i.test(instruction)&&!/(?:give|add|extra)\b/i.test(instruction);
 const old=Number(person[field]??0), value=hours||set?amount:old+(cut?-amount:amount);
 const reason=instruction.match(/\b(?:because|for)\s+(.+?)(?:\s+(?:this month only|every month))?\s*$/i)?.[1]?.trim()??instruction;
 return {...empty(''),changes:[{employee_id:person.employee_id,field,value,previous:old,reason,amount,delta:value-old}],repeat:/\b(every month|monthly|each month)\b/i.test(instruction)};
}
export function payrollNetAfter(p:Row,c:Row) {
 const next:Row={...p,[c.field]:c.value};
 const earned=c.field==='forecast_allowances'?Number(p.forecast_base_salary)*c.value:Number(next.earned_salary_override??next.actual_base_salary??next.forecast_base_salary??0);
 const gross=earned+Number(next.actual_overtime??0)+Number(next.actual_bonus??0)+Number(next.annual_leave_pay??0)-Number(next.unpaid_leave_deduction??0)+Number(next.adjustments_override??0);
 return gross-Number(next.mpf_employee_override??Math.min(1500,gross*.05))-Number(next.other_deductions??0);
}
export function payrollRotaFact(reason:string,shifts:Row[],employeeId:string,year:number,month:number) {
 const key=`${year}-${String(month).padStart(2,'0')}`, own=shifts.filter(s=>s.employee_id===employeeId&&s.shift_date.startsWith(key));
 if(!own.length)return 'No rota for this month, can’t check';
 const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
 const matched=weekdays.filter(d=>new RegExp(`\\b${d}s?\\b`,'i').test(reason));
 if(matched.length!==1)return undefined;
 const day=matched[0],n=own.filter(s=>s.shift_type==='regular'&&new Date(`${s.shift_date}T00:00:00Z`).getUTCDay()===weekdays.indexOf(day)).length;
 return `Rota: ${n} ${day} shifts in this month`;
}