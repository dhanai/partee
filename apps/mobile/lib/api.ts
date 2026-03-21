import Constants from "expo-constants";

type ApiError = {
  error?: string;
};

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  token?: string | null;
  body?: unknown;
};

const fallbackBaseUrl = "http://localhost:3000";
/** Prefer env so `apps/mobile/.env` and EAS secrets override baked `app.json` (physical devices cannot use localhost). */
const baseUrlFromExpoConfig =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ??
  fallbackBaseUrl;

/**
 * Site origin only (no path). Request paths already include `/api/...`.
 * If env is `https://app.vercel.app/api`, requests become `/api/api/...` → 404.
 */
function normalizeApiBaseUrl(raw: string): string {
  let s = String(raw).trim().replace(/\/+$/, "");
  if (/\/api$/i.test(s)) {
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.warn(
        "[Parfade] EXPO_PUBLIC_API_BASE_URL should not end with /api (paths add /api/...). Stripping trailing /api.",
      );
    }
    s = s.replace(/\/api$/i, "");
  }
  return s.replace(/\/$/, "");
}

export const apiBaseUrl = normalizeApiBaseUrl(baseUrlFromExpoConfig);

function responseLooksLikeHtmlPage(raw: string): boolean {
  const s = raw.trimStart().toLowerCase();
  return s.startsWith("<!doctype") || s.startsWith("<html");
}

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  const raw = await res.text();
  let json: (T & ApiError) | null = null;
  if (raw.length > 0) {
    try {
      json = JSON.parse(raw) as T & ApiError;
    } catch {
      if (responseLooksLikeHtmlPage(raw)) {
        const fullUrl = `${apiBaseUrl}${path}`;
        if (res.status === 404) {
          throw new Error(
            `404 for ${fullUrl} (got HTML, not JSON). Common fixes: (1) From repo root run npm run dev:lan so Next listens on your LAN; ensure MAMP/nothing else uses :3000. (2) If /api/* worked then broke after a compile, Next’s .next cache is corrupt — stop dev, rm -rf .next, npm run dev:lan. Check: curl -s -o /dev/null -w "%{http_code}" ${apiBaseUrl}/api/rounds/discover → want 401/200, not 404.`,
          );
        }
        throw new Error(
          `Server returned an HTML error page (${res.status}) for ${path} — often a Next dev crash or stale .next. Base: ${apiBaseUrl}. Try: rm -rf .next && npx next dev -H 0.0.0.0 -p 3000; check the Next terminal for the stack trace.`,
        );
      }
      const preview = raw.replace(/\s+/g, " ").trim().slice(0, 240);
      throw new Error(
        `Unexpected response from server (${res.status}) for ${path}${preview ? `: ${preview}` : ""}`,
      );
    }
  }
  if (!res.ok) {
    throw new Error(json?.error ?? `Request failed (${res.status})`);
  }
  if (!json) {
    throw new Error(`Empty response from server (${res.status}).`);
  }
  return json;
}

export async function apiGet<T>(path: string, token?: string | null): Promise<T> {
  return requestJson<T>(path, { method: "GET", token });
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  token?: string | null,
): Promise<T> {
  return requestJson<T>(path, { method: "POST", body, token });
}

export async function apiPatch<T>(
  path: string,
  body: unknown,
  token?: string | null,
): Promise<T> {
  return requestJson<T>(path, { method: "PATCH", body, token });
}

export async function apiDelete<T>(path: string, token?: string | null): Promise<T> {
  return requestJson<T>(path, { method: "DELETE", token });
}

export function toAbsoluteUrl(urlOrPath: string): string {
  if (/^https?:\/\//i.test(urlOrPath)) {
    return urlOrPath;
  }
  return `${apiBaseUrl}${urlOrPath.startsWith("/") ? "" : "/"}${urlOrPath}`;
}
