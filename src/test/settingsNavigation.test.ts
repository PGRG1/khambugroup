import {describe,it,expect} from 'vitest';
import {resolveSettingsDestination,resolveVenueSection,settingsDestinations,settingsHref,visibleSettingsDestinations} from '../utils/settingsNavigation';
describe('Settings destinations',()=>{
 it('opens the overview without a legacy tab',()=>expect(resolveSettingsDestination(new URLSearchParams())).toBe('overview'));
 it.each([
 ['tab=business','company'],['tab=business&venue=abc','venues'],['tab=business&section=accounts','venues'],
 ['tab=users&view=activity','activity'],['tab=accounting&view=categories','mappings'],['tab=accounting&view=processors','processors'],
 ['tab=accounting&view=opening','opening'],['tab=master-data&md=products','products'],['tab=master-data&md=categories','categories'],['tab=bani','bani'],
 ])('preserves %s',(query,id)=>expect(resolveSettingsDestination(new URLSearchParams(query))).toBe(id));
 it('round trips every navigation destination',()=>{for(const d of settingsDestinations)expect(resolveSettingsDestination(new URLSearchParams(settingsHref(d.id).split('?')[1]))).toBe(d.id);});
 it('restricts non-admin and preview navigation to permitted Lists',()=>expect(visibleSettingsDestinations(false,true).map(d=>d.id)).toEqual(['suppliers','products','categories']));
 it('exposes no destinations without admin or invoice access',()=>expect(visibleSettingsDestinations(false,false)).toEqual([]));
 it('preserves the venue accounts section',()=>expect(resolveVenueSection(new URLSearchParams('tab=business&venue=abc&section=accounts'))).toBe('accounts'));
});