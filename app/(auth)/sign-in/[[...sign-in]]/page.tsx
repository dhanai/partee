import { SignIn } from "@clerk/nextjs";
import { ParfadeWordmark } from "@/components/parfade-wordmark";
import { clerkParfadeAppearance } from "@/lib/clerk-parfade-appearance";

export default function SignInPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[#0f2418] px-6 py-10">
      <div className="mb-8">
        <ParfadeWordmark tone="light" widthPx={140} className="mx-auto block" />
      </div>
      <div className="w-full max-w-sm">
        <SignIn
          appearance={clerkParfadeAppearance}
          routing="path"
          path="/sign-in"
          signUpUrl="/sign-up"
          fallbackRedirectUrl="/discover"
          signUpFallbackRedirectUrl="/discover"
        />
      </div>
    </main>
  );
}
