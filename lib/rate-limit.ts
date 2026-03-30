import { NextResponse } from "next/server";

interface TokenBucket {
  count: number;
  resetTime: number;
}

const buckets = new Map<string, TokenBucket>();

const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetTime <= now) buckets.delete(key);
  }
}

/**
 * Fixed-window rate limiter keyed by IP + a caller-chosen namespace.
 * Returns `{ success: true }` when under the limit, `{ success: false }`
 * when the caller should be rejected.
 *
 * Because Vercel serverless functions don't share memory across instances,
 * this only throttles within a single warm container — good enough to stop
 * simple abuse, but not a substitute for edge-level WAF/rate limiting.
 */
export function rateLimit(
  ip: string,
  namespace: string,
  limit: number,
  windowMs: number,
): { success: boolean } {
  cleanup();

  const key = `${namespace}:${ip}`;
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetTime <= now) {
    buckets.set(key, { count: 1, resetTime: now + windowMs });
    return { success: true };
  }

  bucket.count += 1;
  if (bucket.count > limit) return { success: false };
  return { success: true };
}

export function rateLimitResponse() {
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    { status: 429 },
  );
}
