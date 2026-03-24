import type { Metadata } from "next";
import Link from "next/link";
import { ParfadeWordmark } from "@/components/parfade-wordmark";
import { PublicSiteFooter } from "@/components/public-site-footer";

export const metadata: Metadata = {
  title: "Support — Parfade",
  description: "Get help with Parfade for iOS and the web.",
  robots: { index: true, follow: true },
};

function supportEmail(): string {
  return (
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "support@parfade.com"
  );
}

export default function SupportPage() {
  const email = supportEmail();
  const mailto = `mailto:${email}?subject=${encodeURIComponent("Parfade support")}`;

  return (
    <div className="min-h-dvh bg-cream-100 text-charcoal antialiased">
      <header className="border-b border-[#ece8e1] bg-cream-100/90 px-5 py-4 backdrop-blur-md sm:px-8">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 lg:max-w-3xl xl:max-w-4xl">
          <Link
            href="/"
            className="shrink-0 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-fairway/30"
            aria-label="Parfade home"
          >
            <ParfadeWordmark widthPx={120} />
          </Link>
          <Link
            href={"/sign-in" as never}
            className="text-sm font-semibold text-charcoal-400 transition hover:text-fairway"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-10 sm:px-8 sm:py-14 lg:max-w-3xl lg:px-10 xl:max-w-4xl">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-charcoal">
          Support
        </h1>
        <p className="mt-3 text-[17px] leading-relaxed text-charcoal-400">
          We’re here to help with Parfade on <strong className="font-semibold text-charcoal">iOS</strong> and the{" "}
          <strong className="font-semibold text-charcoal">web</strong>.
        </p>

        <div className="mt-10 space-y-8">
          <section className="rounded-2xl border border-[#ece8e1] bg-white p-6 shadow-sm">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-charcoal-400">
              Contact us
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-charcoal-400">
              For account issues, bugs, or general questions, email us and we’ll get back as soon as we can.
            </p>
            <a
              href={mailto}
              className="mt-4 inline-flex text-[17px] font-bold text-fairway underline decoration-fairway/30 underline-offset-4 transition hover:decoration-fairway"
            >
              {email}
            </a>
          </section>

          <section className="rounded-2xl border border-[#ece8e1] bg-white p-6 shadow-sm">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-charcoal-400">
              Before you write
            </h2>
            <ul className="mt-3 list-inside list-disc space-y-2 text-[15px] leading-relaxed text-charcoal-400">
              <li>Which app you’re using (Parfade for iOS or the website)</li>
              <li>Your device and iOS version, if on mobile</li>
              <li>What you were trying to do and what happened instead</li>
              <li>Screenshots, if they help explain the issue</li>
            </ul>
          </section>

          <section className="rounded-2xl border border-[#ece8e1] bg-white p-6 shadow-sm">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-charcoal-400">
              Account &amp; sign-in
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-charcoal-400">
              Parfade uses secure sign-in. If you’re locked out or need to change your email, contact us at the
              address above from the email you use with your account, if possible.
            </p>
            <p className="mt-3 text-[15px] leading-relaxed text-charcoal-400">
              You can also try signing in on the web:{" "}
              <Link href={"/sign-in" as never} className="font-semibold text-fairway underline underline-offset-4">
                Sign in
              </Link>
              .
            </p>
          </section>
        </div>
      </main>

      <PublicSiteFooter />
    </div>
  );
}
