export function settlementVenueClearing(merchant:{venue:string|null;shared_venues:string[]|null},lines:{venue:string|null;amount:number}[],mappings:Record<string,string>){
 const allowed=merchant.venue?[merchant.venue]:merchant.shared_venues??[];
 if(!allowed.length)throw new Error('Merchant venue is missing');
 return lines.map(l=>{const venue=l.venue??merchant.venue;if(!venue||!allowed.includes(venue))throw new Error('Shared merchant needs explicit venue lines');const account=mappings[venue];if(!account)throw new Error(`Missing clearing mapping for ${venue}`);return {venue,account,amount:l.amount};});
}