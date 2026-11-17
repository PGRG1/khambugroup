import {describe,it,expect} from 'vitest';
import {resolveSettingsDestination,resolveVenueSection,settingsHref,availableSettingsDestinations} from './settingsNavigation';
describe('Settings destinations',()=>{
  it('opens an overview without query parameters',()=>expect(resolveSettingsDestination(new URLSearchParams())).toBe('overview'));
  it.each([
    ['tab=business','company'],['tab=business&venue=venue-id','venues'],['tab=business&section=accounts','venues'],
    ['tab=users&view=activity','activity'],['tab=users','users'],['tab=accounting&view=categories','mappings'],
    ['tab=accounting&view=processors','processors'],['tab=accounting&view=merchants','processors'],
    ['tab=accounting&view=fee-rates','processors'],['tab=accounting&view=opening','opening'],
    ['tab=master-data&md=products','products'],['tab=master-data&md=categories','product-categories'],['tab=bani','learning'],
  ])('preserves legacy %s',(query,key)=>expect(resolveSettingsDestination(new URLSearchParams(query))).toBe(key));
  it('roundtrips a directly linked venue subsection',()=>{
    const params=new URLSearchParams(settingsHref('venues','venue/id','closures').split('?')[1]);
    expect(resolveSettingsDestination(params)).toBe('venues');expect(params.get('venue')).toBe('venue/id');expect(resolveVenueSection(params)).toBe('closures');
  });
  it('rejects unknown destinations',()=>expect(resolveSettingsDestination(new URLSearchParams('destination=secret'))).toBe('invalid'));
  it('only exposes Master data to invoice-access non-admins including preview',()=>expect(availableSettingsDestinations(false,true).map(d=>d.key)).toEqual(['suppliers','products','product-categories']));
  it('exposes nothing to non-admins without invoice access',()=>expect(availableSettingsDestinations(false,false)).toEqual([]));
  it('keeps all real settings accessible to admins',()=>expect(availableSettingsDestinations(true,false)).toHaveLength(21));
});