import type { Metadata } from "next";
import Link from "next/link";
import { ParfadeWordmark } from "@/components/parfade-wordmark";
import { PublicSiteFooter } from "@/components/public-site-footer";

export const metadata: Metadata = {
  title: "Terms of Service — Parfade",
  description: "Terms that govern the use of Parfade on web and mobile.",
  robots: { index: true, follow: true },
};

function supportEmail(): string {
  return process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "support@parfade.com";
}

const EFFECTIVE_DATE = "April 1, 2026";

export default function TermsPage() {
  const email = supportEmail();
  const mailto = `mailto:${email}?subject=${encodeURIComponent("Parfade terms question")}`;

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
          Terms of Service
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-charcoal-400">
          Effective date: <strong className="font-semibold text-charcoal">{EFFECTIVE_DATE}</strong>
        </p>
        <p className="mt-4 text-[17px] leading-relaxed text-charcoal-400">
          These Terms of Service govern your use of Parfade on iOS and the web.
        </p>

        <div className="mt-10 space-y-8">
          <section className="rounded-2xl border border-[#ece8e1] bg-white p-6 shadow-sm">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-charcoal-400">
              1. Using Parfade
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-charcoal-400">
              You may use Parfade only in compliance with applicable laws and these terms. You are
              responsible for activity under your account and for keeping your sign-in credentials secure.
            </p>
          </section>

          <section className="rounded-2xl border border-[#ece8e1] bg-white p-6 shadow-sm">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-charcoal-400">
              2. User content and conduct
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-charcoal-400">
              You retain rights to content you post (such as profile details, group posts, messages, and media),
              but you grant us the rights needed to host and display that content in the service.
            </p>
            <p className="mt-3 text-[15px] leading-relaxed text-charcoal-400">
              You agree not to post illegal, abusive, harassing, or infringing content, and not to misuse
              Parfade through spam, scraping, or unauthorized access attempts.
            </p>
          </section>

          <section className="rounded-2xl border border-[#ece8e1] bg-white p-6 shadow-sm">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-charcoal-400">
              3. Availability and changes
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-charcoal-400">
              We may update features, modify functionality, or suspend parts of the service to improve,
              maintain, or secure Parfade. We do not guarantee uninterrupted availability.
            </p>
          </section>

          <section className="rounded-2xl border border-[#ece8e1] bg-white p-6 shadow-sm">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-charcoal-400">
              4. Termination
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-charcoal-400">
              You may stop using Parfade at any time. We may suspend or terminate access for accounts that
              violate these terms or create risk for users or the platform.
            </p>
          </section>

          <section className="rounded-2xl border border-[#ece8e1] bg-white p-6 shadow-sm">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-charcoal-400">
              5. Disclaimers and liability
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-charcoal-400">
              Parfade is provided on an &quot;as is&quot; and &quot;as available&quot; basis. To the fullest extent
              permitted by law, we disclaim warranties and limit liability for indirect, incidental, or
              consequential damages arising from use of the service.
            </p>
          </section>

          <section className="rounded-2xl border border-[#ece8e1] bg-white p-6 shadow-sm">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-charcoal-400">
              6. Contact
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-charcoal-400">
              Questions about these terms can be sent to:
            </p>
            <a
              href={mailto}
              className="mt-4 inline-flex text-[17px] font-bold text-fairway underline decoration-fairway/30 underline-offset-4 transition hover:decoration-fairway"
            >
              {email}
            </a>
          </section>
        </div>
      </main>

      <PublicSiteFooter />
    </div>
  );
}
