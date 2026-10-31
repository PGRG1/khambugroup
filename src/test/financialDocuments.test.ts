import {describe,it,expect} from 'vitest';
import {indexDocuments,storedPath} from '../utils/financialDocuments';
describe('Stored financial documents',()=>{
 it('links supplier attachments to their original invoice',()=>{expect(indexDocuments('invoice_attachments',[{id:'file',invoice_id:'invoice',path:'a.pdf',original_name:'receipt.pdf',bucket:'invoice-files',attached_at:'2026-10-31'}])[0].link).toBe('/procurement/invoices?invoice=invoice');});
 it('indexes contracts but excludes IDs, permits and sick notes',()=>{expect(indexDocuments('hr_person_documents',[{id:'1',kind:'contract',storage_path:'a.pdf',employee_id:'p'},{id:'2',kind:'sick_note',storage_path:'b.pdf',employee_id:'p'}]).map(d=>d.id)).toEqual(['hr_person_documents:1:0']);});
 it('does not treat documents without stored files as uploads',()=>{expect(indexDocuments('invoices',[{id:'i',file_name:'invoice.pdf'}])).toEqual([]);});
 it('rejects external file URLs rather than sending them credentials',()=>{expect(storedPath('https://example.com/a.pdf','invoice-files')).toBeNull();});
 it('recovers the bucket-relative path from legacy stored-file URLs',()=>{expect(storedPath('https://host/storage/v1/object/sign/invoice-files/tenant/a.pdf?token=old','invoice-files')).toBe('tenant/a.pdf');});
});