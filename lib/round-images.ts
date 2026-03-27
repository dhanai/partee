const GENERIC_ROUND_IMAGE = "/images/event-fallback.svg";

type GooglePhoto = {
  photo_reference?: unknown;
};

function extractPhotoReference(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  if (!metadata) return null;
  const photos = metadata.photos;
  if (!Array.isArray(photos) || photos.length === 0) return null;

  for (const photo of photos as GooglePhoto[]) {
    if (
      photo &&
      typeof photo === "object" &&
      typeof photo.photo_reference === "string" &&
      photo.photo_reference.length > 0
    ) {
      return photo.photo_reference;
    }
  }

  return null;
}

function extractLatLng(
  metadata: Record<string, unknown> | null | undefined,
): { lat: number; lng: number } | null {
  if (!metadata) return null;
  const geo = metadata.geometry as { location?: { lat?: unknown; lng?: unknown } } | undefined;
  const lat = geo?.location?.lat;
  const lng = geo?.location?.lng;
  if (typeof lat === "number" && typeof lng === "number") return { lat, lng };
  return null;
}

export function resolveRoundImageUrl(input: {
  customImageUrl?: string | null;
  courseMetadata?: Record<string, unknown> | null;
}) {
  const customImageUrl = input.customImageUrl?.trim();
  if (customImageUrl) return customImageUrl;

  const photoReference = extractPhotoReference(input.courseMetadata);
  if (photoReference) {
    return `/api/images/course-photo?ref=${encodeURIComponent(photoReference)}`;
  }

  const coords = extractLatLng(input.courseMetadata);
  if (coords) {
    return `/api/images/course-satellite?lat=${coords.lat}&lng=${coords.lng}`;
  }

  return GENERIC_ROUND_IMAGE;
}
