import type { Metadata } from "next";
import Link from "next/link";
import { ParfadeWordmark } from "@/components/parfade-wordmark";
import { PublicSiteFooter } from "@/components/public-site-footer";
import { loadPrivacyPageContent } from "@/lib/page-content";

export async function generateMetadata(): Promise<Metadata> {
  const content = await loadPrivacyPageContent();
  return {
    title: `${content.title} — Parfade`,
    description: content.intro,
    robots: { index: true, follow: true },
  };
}

function supportEmail(): string {
  return process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "support@parfade.com";
}

export default async function PrivacyPage() {
  const email = supportEmail();
  const mailto = `mailto:${email}?subject=${encodeURIComponent("Parfade privacy request")}`;
  const content = await loadPrivacyPageContent();

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
          {content.title}
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-charcoal-400">
          Effective date: <strong className="font-semibold text-charcoal">{content.effectiveDate}</strong>
        </p>
        <p className="mt-4 text-[17px] leading-relaxed text-charcoal-400">
          {content.intro}
        </p>

        <div className="mt-10 space-y-8">
          <section className="rounded-2xl border border-[#ece8e1] bg-white p-6 shadow-sm">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-charcoal-400">
              Information we collect
            </h2>
            <ul className="mt-3 list-inside list-disc space-y-2 text-[15px] leading-relaxed text-charcoal-400">
              <li>
                <strong className="font-semibold text-charcoal">Account information</strong> such as
                name, email, profile image, and sign-in details through our auth provider.
              </li>
              <li>
                <strong className="font-semibold text-charcoal">Profile and social data</strong> such as
                handicap, location, followers/following, and your discover visibility settings.
              </li>
              <li>
                <strong className="font-semibold text-charcoal">Round and game data</strong> including
                invites, RSVPs, roster, chat messages, scores, and game session settings/results.
              </li>
              <li>
                <strong className="font-semibold text-charcoal">Device and notification data</strong>{" "}
                including push tokens and notification preferences needed to deliver alerts.
              </li>
              <li>
                <strong className="font-semibold text-charcoal">Media you upload</strong> such as avatar
                images and promo/media assets uploaded through our web tools.
              </li>
            </ul>
          </section>

          <section className="rounded-2xl border border-[#ece8e1] bg-white p-6 shadow-sm">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-charcoal-400">
              How we use information
            </h2>
            <ul className="mt-3 list-inside list-disc space-y-2 text-[15px] leading-relaxed text-charcoal-400">
              <li>Provide core features like creating rounds, chat, invites, and game scoring.</li>
              <li>Personalize your feed and discover experience (for example by location/date).</li>
              <li>Send transactional notifications such as round invites, chat alerts, and follow requests.</li>
              <li>Secure accounts, prevent abuse, and troubleshoot product issues.</li>
              <li>Improve Parfade through analytics, diagnostics, and product development.</li>
            </ul>
          </section>

          <section className="rounded-2xl border border-[#ece8e1] bg-white p-6 shadow-sm">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-charcoal-400">
              Sharing and service providers
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-charcoal-400">
              We do not sell your personal information. We share data with service providers that help us
              run Parfade, such as:
            </p>
            <ul className="mt-3 list-inside list-disc space-y-2 text-[15px] leading-relaxed text-charcoal-400">
              <li>Authentication and identity services</li>
              <li>Cloud hosting, storage, and database infrastructure</li>
              <li>Push notification delivery services</li>
              <li>Location/search providers used for course and place lookup</li>
            </ul>
            <p className="mt-3 text-[15px] leading-relaxed text-charcoal-400">
              We may also disclose information when required by law, to enforce our terms, or to protect
              users and the service.
            </p>
          </section>

          <section className="rounded-2xl border border-[#ece8e1] bg-white p-6 shadow-sm">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-charcoal-400">
              Your choices
            </h2>
            <ul className="mt-3 list-inside list-disc space-y-2 text-[15px] leading-relaxed text-charcoal-400">
              <li>You can update profile fields in the app/web profile settings.</li>
              <li>You can manage push notifications through device settings and app preferences.</li>
              <li>You can request account help or deletion by contacting us at the email below.</li>
            </ul>
          </section>

          <section className="rounded-2xl border border-[#ece8e1] bg-white p-6 shadow-sm">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-charcoal-400">
              Data retention
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-charcoal-400">
              We retain information as long as needed to provide Parfade and meet legal, security, and
              operational requirements. Retention periods depend on the type of data and account state.
            </p>
          </section>

          <section className="rounded-2xl border border-[#ece8e1] bg-white p-6 shadow-sm">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-charcoal-400">
              Children&apos;s privacy
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-charcoal-400">
              Parfade is not intended for children under 13 (or the minimum age required in your region),
              and we do not knowingly collect personal information from children.
            </p>
          </section>

          <section className="rounded-2xl border border-[#ece8e1] bg-white p-6 shadow-sm">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.06em] text-charcoal-400">
              Contact us
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-charcoal-400">
              For privacy requests or questions, contact us at:
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
