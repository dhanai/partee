export function cn(...parts: Array<string | undefined | false | null>): string {
  return parts.filter(Boolean).join(" ");
}

export function formatDateTime(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Neon / Drizzle may return timestamptz as `string`; never call `.toISOString()` blindly. */
export function toIsoTimestamp(v: Date | string): string {
  if (v instanceof Date) return v.toISOString();
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    throw new TypeError("Invalid timestamp from database");
  }
  return d.toISOString();
}

export function timestampMs(v: Date | string | null | undefined): number | null {
  if (v == null) return null;
  if (v instanceof Date) {
    const n = v.getTime();
    return Number.isNaN(n) ? null : n;
  }
  const n = new Date(v).getTime();
  return Number.isNaN(n) ? null : n;
}

/** Nullable timestamptz: empty string or invalid parses as null (avoid 500 on odd DB rows). */
export function toIsoTimestampOrNull(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  if (v instanceof Date) {
    const n = v.getTime();
    return Number.isNaN(n) ? null : v.toISOString();
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function haversineMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
