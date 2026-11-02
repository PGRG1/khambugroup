import {describe,it,expect} from 'vitest';
import {statementKind,statementDuplicate} from '@/utils/statementQueue';
describe('statement review routing',()=>{
 it('uses bank parser for bank evidence',()=>expect(statementKind('HSBC November.pdf')).toBe('bank'));
 it('routes utility evidence without creating an account',()=>expect(statementKind('CLP meter.pdf')).toBe('utility'));
 it('routes both named settlement providers',()=>{expect(statementKind('KPay.xlsx')).toBe('settlement');expect(statementKind('YeahPay.csv')).toBe('settlement');});
 it('requires review for unknown evidence',()=>expect(statementKind('scan.pdf')).toBe('unknown'));
 it('detects equal bytes independently of filename',()=>{expect(statementDuplicate('abc',['abc'])).toBe(true);expect(statementDuplicate('def',['abc'])).toBe(false);});
});