type PerfMeta = Record<string, string | number | boolean | null | undefined>;

const PERF_ENABLED =
  process.env.PROFILE_ACTIVITY_PERF === "1" || process.env.NODE_ENV !== "production";

export function withPerfTimer(name: string) {
  const started = Date.now();
  return (meta?: PerfMeta) => {
    if (!PERF_ENABLED) return;
    const elapsedMs = Date.now() - started;
    const payload = meta
      ? Object.entries(meta)
          .filter(([, value]) => value !== undefined)
          .map(([key, value]) => `${key}=${String(value)}`)
          .join(" ")
      : "";
    console.info(`[perf] ${name} elapsed_ms=${elapsedMs}${payload ? ` ${payload}` : ""}`);
  };
}
