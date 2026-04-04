import { env } from "@/lib/env";

export type PlacesCourse = {
  googlePlaceId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  metadata: Record<string, unknown>;
};

type GoogleTextSearchResponse = {
  results?: Array<{
    place_id: string;
    name: string;
    formatted_address?: string;
    geometry?: { location?: { lat: number; lng: number } };
  }>;
  status?: string;
  error_message?: string;
};

type GoogleGeocodeResponse = {
  results?: Array<{
    formatted_address?: string;
    geometry?: { location?: { lat: number; lng: number } };
    address_components?: Array<{
      long_name: string;
      short_name: string;
      types: string[];
    }>;
  }>;
  status?: string;
  error_message?: string;
};

export type PlacesLocation = {
  label: string;
  city: string;
  state: string;
  lat: number | null;
  lng: number | null;
};

function normalizeLocationLabel(input: string): string | null {
  const trimmed = input.trim().replace(/\s+/g, " ");
  const match = /^([^,]+),\s*([a-z]{2})$/i.exec(trimmed);
  if (!match) return null;
  const city = match[1].trim();
  const state = match[2].toUpperCase();
  if (!city) return null;
  return `${city}, ${state}`;
}

/** Places Text Search allows up to 50km radius for location restriction. */
export const GOLF_COURSE_SEARCH_RADIUS_METERS = 50_000;

export type GolfCourseSearchBias = {
  lat: number;
  lng: number;
  radiusMeters?: number;
};

const GEOCODE_BIAS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const geocodeBiasCache = new Map<
  string,
  { lat: number; lng: number; expires: number }
>();

export async function searchGolfCourses(
  query: string,
  bias?: GolfCourseSearchBias,
): Promise<PlacesCourse[]> {
  const apiKey = env.server.GOOGLE_PLACES_API_KEY.trim();
  if (!apiKey || apiKey.includes("placeholder") || !apiKey.startsWith("AIza")) {
    throw new Error(
      "GOOGLE_PLACES_API_KEY is missing or invalid. Add a real server key in environment variables.",
    );
  }

  const params = new URLSearchParams({
    query: `${query} golf course`,
    type: "golf_course",
    key: apiKey,
  });
  if (bias) {
    const radius = bias.radiusMeters ?? GOLF_COURSE_SEARCH_RADIUS_METERS;
    params.set("location", `${bias.lat},${bias.lng}`);
    params.set("radius", String(radius));
  }

  const response = await fetch(
    `https://maps.googleapis.com/maps/api/place/textsearch/json?${params.toString()}`,
    { next: { revalidate: 0 } },
  );

  if (!response.ok) {
    throw new Error(`Google Places request failed with ${response.status}`);
  }

  const json = (await response.json()) as GoogleTextSearchResponse;
  if (
    json.status &&
    !["OK", "ZERO_RESULTS"].includes(json.status) &&
    json.status !== "ZERO_RESULTS"
  ) {
    throw new Error(json.error_message ?? `Google Places status: ${json.status}`);
  }

  return (json.results ?? [])
    .filter((result) => result.place_id && result.geometry?.location)
    .map((result) => ({
      googlePlaceId: result.place_id,
      name: result.name,
      address: result.formatted_address ?? "",
      lat: result.geometry!.location!.lat,
      lng: result.geometry!.location!.lng,
      metadata: result as unknown as Record<string, unknown>,
    }));
}

export async function searchUsLocations(query: string): Promise<PlacesLocation[]> {
  const apiKey = env.server.GOOGLE_PLACES_API_KEY.trim();
  if (!apiKey || apiKey.includes("placeholder") || !apiKey.startsWith("AIza")) {
    throw new Error(
      "GOOGLE_PLACES_API_KEY is missing or invalid. Add a real server key in environment variables.",
    );
  }

  const params = new URLSearchParams({
    address: query,
    components: "country:US",
    key: apiKey,
  });

  const response = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`,
    { next: { revalidate: 0 } },
  );

  if (!response.ok) {
    throw new Error(`Google Geocode request failed with ${response.status}`);
  }

  const json = (await response.json()) as GoogleGeocodeResponse;
  if (
    json.status &&
    !["OK", "ZERO_RESULTS"].includes(json.status) &&
    json.status !== "ZERO_RESULTS"
  ) {
    throw new Error(json.error_message ?? `Google Geocode status: ${json.status}`);
  }

  const seen = new Set<string>();
  const results: PlacesLocation[] = [];
  for (const item of json.results ?? []) {
    const components = item.address_components ?? [];
    const cityComponent =
      components.find((c) => c.types.includes("locality")) ??
      components.find((c) => c.types.includes("postal_town")) ??
      components.find((c) => c.types.includes("administrative_area_level_2"));
    const stateComponent = components.find((c) =>
      c.types.includes("administrative_area_level_1"),
    );

    if (!cityComponent || !stateComponent) continue;
    const city = cityComponent.long_name;
    const state = stateComponent.short_name;
    const label = `${city}, ${state}`;
    if (seen.has(label)) continue;
    seen.add(label);

    results.push({
      label,
      city,
      state,
      lat: item.geometry?.location?.lat ?? null,
      lng: item.geometry?.location?.lng ?? null,
    });
    if (results.length >= 8) break;
  }

  return results;
}

export async function resolveValidatedUsLocationLabel(
  input: string,
): Promise<string | null> {
  const normalized = normalizeLocationLabel(input);
  if (!normalized) return null;
  const matches = await searchUsLocations(normalized);
  const exact = matches.find(
    (candidate) => candidate.label.toLowerCase() === normalized.toLowerCase(),
  );
  return exact?.label ?? null;
}

export async function resolveValidatedUsLocation(
  input: string,
): Promise<PlacesLocation | null> {
  const normalized = normalizeLocationLabel(input);
  if (!normalized) return null;
  const matches = await searchUsLocations(normalized);
  const exact = matches.find(
    (candidate) => candidate.label.toLowerCase() === normalized.toLowerCase(),
  );
  return exact ?? null;
}

/**
 * Geocode profile `homeCourse` ("City, ST") to coordinates for Places bias, with in-memory cache
 * to avoid repeated Geocoding API calls on debounced course search.
 */
export async function getBiasCoordsFromProfileHomeCourse(
  homeCourse: string,
): Promise<{ lat: number; lng: number } | null> {
  const key = homeCourse.trim().toLowerCase();
  if (!key) return null;
  const hit = geocodeBiasCache.get(key);
  if (hit && hit.expires > Date.now()) {
    return { lat: hit.lat, lng: hit.lng };
  }
  const resolved = await resolveValidatedUsLocation(homeCourse);
  if (!resolved || resolved.lat == null || resolved.lng == null) {
    return null;
  }
  geocodeBiasCache.set(key, {
    lat: resolved.lat,
    lng: resolved.lng,
    expires: Date.now() + GEOCODE_BIAS_CACHE_TTL_MS,
  });
  return { lat: resolved.lat, lng: resolved.lng };
}
