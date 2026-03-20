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

export async function searchGolfCourses(query: string): Promise<PlacesCourse[]> {
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
