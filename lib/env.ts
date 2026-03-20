const requiredServerVars = [
  "DATABASE_URL",
  "CLERK_SECRET_KEY",
  "CLERK_WEBHOOK_SECRET",
  "GOOGLE_PLACES_API_KEY",
] as const;

const requiredPublicVars = ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"] as const;

function readEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  server: Object.fromEntries(
    requiredServerVars.map((name) => [name, readEnvVar(name)]),
  ) as Record<(typeof requiredServerVars)[number], string>,
  public: Object.fromEntries(
    requiredPublicVars.map((name) => [name, readEnvVar(name)]),
  ) as Record<(typeof requiredPublicVars)[number], string>,
};
