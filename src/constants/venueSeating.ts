const STORAGE_KEY = "venue_seating_config";

const DEFAULT_SEATING: Record<string, number> = {
  Assembly: 70,
  Caliente: 50,
};

export const getVenueSeatingConfig = (): Record<string, number> => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULT_SEATING, ...JSON.parse(stored) };
  } catch {}
  return { ...DEFAULT_SEATING };
};

export const setVenueSeatingConfig = (config: Record<string, number>) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
};

export const VENUE_SEATING = DEFAULT_SEATING;

export const getVenueSeats = (venue: string): number | null => {
  const config = getVenueSeatingConfig();
  return config[venue] ?? null;
};
