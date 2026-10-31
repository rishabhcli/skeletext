/** One earthquake from a USGS GeoJSON feed. */
export interface QuakeFeature {
  id: string;
  mag: number;
  place: string;
  /** Milliseconds since the epoch. */
  time: number;
  url: string;
  felt: number | null;
  alert: string | null;
  tsunami: boolean;
  sig: number;
  lon: number;
  lat: number;
  /** Depth in kilometres. */
  depth: number;
}

export interface FeedResult {
  features: QuakeFeature[];
  /** Feed generation time in milliseconds since the epoch. */
  generated: number;
}

export const FEED_URLS = {
  day: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson',
  week: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson',
} as const;

export type FeedName = keyof typeof FEED_URLS;
