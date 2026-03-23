import { SignUp } from "@clerk/nextjs";
import { ParfadeWordmark } from "@/components/parfade-wordmark";
import { clerkParfadeAppearance } from "@/lib/clerk-parfade-appearance";

export default function SignUpPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[#0f2418] px-6 py-10">
      <div className="mb-8">
        <ParfadeWordmark tone="light" widthPx={140} className="mx-auto block" />
      </div>
      <div className="w-full max-w-sm">
        <SignUp
          appearance={clerkParfadeAppearance}
          fallbackRedirectUrl="/discover"
          signInFallbackRedirectUrl="/discover"
        />
      </div>
    </main>
  );
}
