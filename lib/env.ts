/** Only vars needed for DB + core auth. Optional keys must not block API boot (e.g. mobile uses no Places). */
const requiredServerVars = ["DATABASE_URL", "CLERK_SECRET_KEY"] as const;

const requiredPublicVars = ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] as const;

function readEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  server: {
    ...Object.fromEntries(
      requiredServerVars.map((name) => [name, readEnvVar(name)]),
    ),
    CLERK_WEBHOOK_SECRET: process.env.CLERK_WEBHOOK_SECRET ?? "",
    GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY ?? "",
  } as Record<(typeof requiredServerVars)[number] | "CLERK_WEBHOOK_SECRET" | "GOOGLE_PLACES_API_KEY", string>,
  public: Object.fromEntries(
    requiredPublicVars.map((name) => [name, readEnvVar(name)]),
  ) as Record<(typeof requiredPublicVars)[number], string>,
};
