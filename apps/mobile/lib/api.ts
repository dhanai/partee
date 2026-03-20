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

export const apiBaseUrl = String(baseUrlFromExpoConfig).replace(/\/$/, "");

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
        throw new Error(
          `Server returned an HTML error page (${res.status}) for ${path} — usually a Next.js crash or bad build, not your API JSON. Base URL: ${apiBaseUrl}. Try: stop dev server, rm -rf .next, npm run dev; check the terminal running Next for the real stack trace.`,
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
