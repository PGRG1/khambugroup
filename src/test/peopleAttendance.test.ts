import {describe,it,expect} from 'vitest';
import {attendanceMetrics,restDayMetrics,dueSoon} from '@/utils/peopleAttendance';
import {addOwedRestToDraft} from '../../supabase/functions/_shared/peopleRotaPattern';
import type {PersonEvidence} from '@/utils/peopleRecord';
const person={id:'p'};
const data=(patch:Partial<PersonEvidence>={}):PersonEvidence=>({shifts:[],attendance:[],requests:[],leave:[],ledger:[],holidays:[],payroll:[],swaps:[],terms:[],today:'2026-11-30',...patch});
const shift=(day:number,type='regular')=>({id:String(day),employee_id:'p',shift_date:`2026-11-${String(day).padStart(2,'0')}`,shift_type:type,start_time:'09:00',end_time:'17:00'});
const seven=Array.from({length:7},(_,i)=>shift(i+2));
describe('Evidence-only rest days',()=>{
 it('owes one for Monday through Sunday worked, due 30 days after Sunday',()=>{const r=restDayMetrics(person,data({shifts:seven}));expect(r.owed).toBe(1);expect(r.outstanding[0]?.due).toBe('2026-12-08');});
 it('never guesses work or days off from missing records',()=>{expect(restDayMetrics(person,data({shifts:seven.slice(0,6)})).owed).toBe(0);expect(restDayMetrics(person,data({shifts:[...seven,shift(9,'RD'),shift(10,'RD')]})).owed).toBe(1);});
 it('clears with an evidenced later Mon–Sun period having two days off',()=>{expect(restDayMetrics(person,data({shifts:[...seven,...Array.from({length:7},(_,i)=>shift(i+9,i<2?'RD':'regular'))]})).owed).toBe(0);});
 it('clears an explicit substitute rest day within 30 days',()=>{const r=restDayMetrics(person,data({shifts:[...seven,{...shift(10,'RD'),notes:'Substitute rest day'}]}));expect(r.owed).toBe(0);expect(r.lines[1]?.date).toBe('2026-11-10');});
 it('does not clear an expired debt',()=>{expect(restDayMetrics(person,data({today:'2026-12-10',shifts:[...seven,{...shift(10,'RD'),shift_date:'2026-12-09',notes:'Substitute rest day'}]})).owed).toBe(1);});
 it('deduplicates multiple shifts/clock-ins on a day and excludes no-shows',()=>{const attendance=seven.map(s=>({employee_id:'p',date:s.shift_date,clock_in:s.shift_date+'T01:00:00Z'}));expect(restDayMetrics(person,data({shifts:[...seven,...seven],attendance})).owed).toBe(1);expect(restDayMetrics(person,data({shifts:seven.map(s=>({...s,no_show:true}))})).owed).toBe(0);});
 it('turns orange within 14 days or overdue, not 15 days away',()=>{expect(dueSoon('2026-12-08','2026-11-24')).toBe(true);expect(dueSoon('2026-12-08','2026-11-23')).toBe(false);expect(dueSoon('2026-11-01','2026-11-30')).toBe(true);});
 it('adds owed rest to next draft only without modifying saved shifts or input',()=>{const proposed=[shift(16)];const before=JSON.stringify(proposed);const r=addOwedRestToDraft(proposed,[],seven,[],[person],'2026-11-16','2026-11-15',[]);expect(r[0]?.shift_type).toBe('RD');expect(r[0]?.notes).toContain('2026-12-08');expect(JSON.stringify(proposed)).toBe(before);expect(addOwedRestToDraft(proposed,proposed,seven,[],[person],'2026-11-16','2026-11-15',[])[0]?.shift_type).toBe('regular');});
});
describe('Separate attendance facts',()=>{
 it('keeps Late, no-show, early and covered counts separate',()=>{const d=data({shifts:[{...shift(2),no_show:true},shift(3)],attendance:[{employee_id:'p',date:'2026-11-03',clock_in:'2026-11-03T01:10:00Z',clock_out:'2026-11-03T08:50:00Z'}],swaps:[{id:'cover',shift_id:'3',replacement_employee_id:'p',status:'approved'}]});const a=attendanceMetrics(person,d);expect([a.late,a.noShows,a.early,a.covered]).toEqual([1,1,1,1]);});
 it('reports unknown last-eight-week coverage and preserves last rota date',()=>{const a=attendanceMetrics(person,data({shifts:[{...shift(2),shift_date:'2026-03-09'}]}));expect(a.coverage).toBe(false);expect(a.lastRota).toBe('2026-03-09');});
});