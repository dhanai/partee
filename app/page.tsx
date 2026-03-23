import Image from "next/image";
import Link from "next/link";
import { ParfadeWordmark } from "@/components/parfade-wordmark";
import { authLandingGradientBackgroundImage } from "@/lib/auth-landing-gradient";

export default function MarketingPage() {
  const overlay = authLandingGradientBackgroundImage();

  return (
    <main className="relative min-h-screen bg-[#0f2418]">
      <div className="pointer-events-none absolute inset-0">
        <Image
          src="/marketing/landing-hero.png"
          alt=""
          fill
          priority
          className="object-cover object-top"
          sizes="100vw"
        />
        <div
          className="absolute inset-0"
          style={{ backgroundImage: overlay }}
          aria-hidden
        />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col px-[22px] pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="flex flex-1 flex-col justify-end gap-[22px] pb-1">
          <div className="flex w-full max-w-lg flex-col items-start gap-3.5">
            <ParfadeWordmark tone="light" widthPx={165} />
            <h1 className="text-balance text-left text-[2.5rem] font-medium leading-[1.15] tracking-[-0.02em] text-[#f8f6f1] [text-shadow:0_1px_10px_rgba(0,0,0,0.25)]">
              Golf plans without the group text chaos.
            </h1>
          </div>

          <div className="flex w-full max-w-lg flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href={"/sign-up" as never}
              className="flex w-full items-center justify-center rounded-2xl bg-[#f4f1ea] py-4 text-center text-[17px] font-bold tracking-[-0.01em] text-[#0f2418] shadow-[0_4px_10px_rgba(0,0,0,0.22)] transition hover:opacity-[0.96] active:scale-[0.99] sm:flex-1"
            >
              Get started
            </Link>
            <Link
              href={"/sign-in" as never}
              className="flex w-full items-center justify-center rounded-2xl border border-white/25 bg-white/10 py-4 text-center text-[17px] font-semibold tracking-[-0.01em] text-[#f4f1ea] backdrop-blur-sm transition hover:bg-white/15 sm:flex-1"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
