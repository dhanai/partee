/**
 * Derives display / map fields from Google Places-shaped course metadata stored on `courses.metadata`.
 */
function parseCoord(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function extractCourseLocationFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): {
  address: string | null;
  latitude: number | null;
  longitude: number | null;
} {
  if (!metadata) {
    return { address: null, latitude: null, longitude: null };
  }

  const formatted = metadata.formatted_address;
  const address =
    typeof formatted === "string" && formatted.trim().length > 0 ? formatted.trim() : null;

  const geo = metadata.geometry as { location?: { lat?: unknown; lng?: unknown } } | undefined;
  const lat = geo?.location?.lat;
  const lng = geo?.location?.lng;
  const latitude = parseCoord(lat);
  const longitude = parseCoord(lng);

  return { address, latitude, longitude };
}

/**
 * Prefer metadata (Places-shaped JSON); fall back to denormalized `courses` columns when metadata
 * is missing geometry or uses string coords.
 */
export function resolveCourseLocation(
  metadata: Record<string, unknown> | null | undefined,
  courseRow: { address?: string | null; lat?: unknown; lng?: unknown } | null | undefined,
): {
  address: string | null;
  latitude: number | null;
  longitude: number | null;
} {
  const fromMeta = extractCourseLocationFromMetadata(metadata);
  const rowAddr = courseRow?.address?.trim();
  const rowLat = parseCoord(courseRow?.lat);
  const rowLng = parseCoord(courseRow?.lng);

  return {
    address: fromMeta.address ?? (rowAddr ? rowAddr : null),
    latitude: fromMeta.latitude ?? rowLat,
    longitude: fromMeta.longitude ?? rowLng,
  };
}
