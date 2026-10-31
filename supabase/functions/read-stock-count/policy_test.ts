import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { validateStockRead } from './policy.ts';
Deno.test('Unknown products are never invented or saved as known items', () => {
  assertEquals(validateStockRead([{product_master_id:'invented',qty:7,confidence:'sure',note:'Unknown bottle'}],new Set(['asahi']))[0].product_master_id,null);
});
Deno.test('Known stock-unit quantities are preserved', () => {
  assertEquals(validateStockRead([{product_master_id:'asahi',qty:103,confidence:'sure',note:'4 cases of 24 plus 7 bottles'}],new Set(['asahi']))[0].qty,103);
});
Deno.test('An unreadable quantity needs identification before sending', () => {
  assertEquals(validateStockRead([{product_master_id:'asahi',qty:null,confidence:'cant_tell',note:'Shelf obscured'}],new Set(['asahi']))[0].product_master_id,null);
});