import {it,expect} from 'vitest';
import {invoiceAssetEligible} from '@/utils/invoiceAsset';
it('requires the line to exceed the capitalisation limit',()=>{expect(invoiceAssetEligible(5000,5000)).toBe(false);expect(invoiceAssetEligible(6000,5000)).toBe(true);expect(invoiceAssetEligible(NaN,5000)).toBe(false);});