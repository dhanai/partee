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
const baseUrlFromExpoConfig =
  Constants.expoConfig?.extra?.apiBaseUrl ??
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  fallbackBaseUrl;

export const apiBaseUrl = String(baseUrlFromExpoConfig).replace(/\/$/, "");

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
      throw new Error(`Unexpected response from server (${res.status}).`);
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
