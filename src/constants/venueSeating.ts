export const VENUE_SEATING: Record<string, number> = {
  Assembly: 70,
  Caliente: 50,
};

export const getVenueSeats = (venue: string): number | null => {
  return VENUE_SEATING[venue] ?? null;
};
