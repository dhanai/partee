import Image from "next/image";
import Link from "next/link";
import { ParfadeWordmark } from "@/components/parfade-wordmark";

const gallery = [
  {
    src: "/marketing/brochure/my-rounds.png",
    label: "My rounds",
    caption: "Hosting, invites, and joined rounds.",
  },
  {
    src: "/marketing/brochure/planning-round.png",
    label: "Planning",
    caption: "Lock players first, details later.",
  },
  {
    src: "/marketing/brochure/games.png",
    label: "Games",
    caption: "Skins, Wolf, and session history.",
  },
  {
    src: "/marketing/brochure/profile.png",
    label: "Profile",
    caption: "Handicap, followers, and stats.",
  },
] as const;

function DeviceShot({
  src,
  alt,
  priority,
  className,
}: {
  src: string;
  alt: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[26px] border border-[#ece8e1] bg-[#0b0b0c] shadow-[0_24px_48px_-16px_rgba(0,0,0,0.22)] ${className ?? ""}`}
    >
      <div className="relative aspect-[1179/2556] w-full">
        <Image
          src={src}
          alt={alt}
          fill
          priority={priority}
          className="object-cover object-top"
          sizes="(max-width: 1024px) 72vw, 320px"
        />
      </div>
    </div>
  );
}

export function MarketingBrochure({ appStoreUrl }: { appStoreUrl: string | null }) {
  return (
    <div className="min-h-dvh bg-cream-100 text-charcoal antialiased">
      <header className="border-b border-[#ece8e1] bg-cream-100/90 px-5 py-4 backdrop-blur-md sm:px-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <ParfadeWordmark widthPx={132} className="shrink-0" />
          <Link
            href={"/sign-in" as never}
            className="text-sm font-semibold text-charcoal-400 transition hover:text-fairway"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main>
        <section className="border-b border-[#e2e8e3] bg-gradient-to-br from-fairway-50 via-cream-100 to-[#f3efe6]">
          <div className="mx-auto max-w-5xl px-5 pb-16 pt-10 sm:px-8 sm:pb-20 sm:pt-14">
          <div className="grid items-center gap-12 lg:grid-cols-[1fr_minmax(260px,320px)] lg:gap-16">
            <div className="max-w-xl">
              <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-gold">
                Organize golf with your crew
              </p>
              <h1 className="mt-3 text-balance text-[2.25rem] font-bold leading-[1.12] tracking-tight sm:text-[2.75rem]">
                Golf plans without the group text chaos.
              </h1>
              <p className="mt-4 text-pretty text-[17px] leading-snug text-charcoal-400">
                Parfade is for inviting friends, filling open spots, and keeping rounds and side games
                in one calm place—on the course or on the couch.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                {appStoreUrl ? (
                  <a
                    href={appStoreUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-[52px] items-center justify-center rounded-2xl bg-fairway px-6 text-[15px] font-bold text-cream-100 shadow-[0_4px_14px_rgba(26,60,42,0.28)] transition hover:bg-fairway-600 active:scale-[0.99]"
                  >
                    Download on the App Store
                  </a>
                ) : null}
                <Link
                  href={"/sign-up" as never}
                  className={
                    appStoreUrl
                      ? "inline-flex h-[52px] items-center justify-center rounded-2xl border-2 border-fairway bg-white/80 px-6 text-[15px] font-bold text-fairway backdrop-blur-sm transition hover:bg-fairway-50 active:scale-[0.99]"
                      : "inline-flex h-[52px] items-center justify-center rounded-2xl border border-fairway/20 bg-fairway px-6 text-[15px] font-bold text-cream-100 shadow-[0_4px_14px_rgba(26,60,42,0.22)] transition hover:bg-fairway-600 active:scale-[0.99] sm:min-w-[200px]"
                  }
                >
                  {appStoreUrl ? "Use the web app" : "Get started"}
                </Link>
              </div>
              {!appStoreUrl && process.env.NODE_ENV === "development" ? (
                <p className="mt-3 text-[13px] text-charcoal-300">
                  Set{" "}
                  <code className="rounded bg-cream-200 px-1.5 py-0.5 text-[12px] text-charcoal-500">
                    NEXT_PUBLIC_IOS_APP_STORE_URL
                  </code>{" "}
                  to show the App Store button.
                </p>
              ) : null}
            </div>

            <div className="mx-auto w-full max-w-[280px] lg:mx-0 lg:max-w-none lg:justify-self-end">
              <DeviceShot
                src="/marketing/brochure/discover.png"
                alt="Parfade Discover feed showing open rounds looking for players"
                priority
              />
            </div>
          </div>
          </div>
        </section>

        <section className="border-t border-[#ece8e1] bg-white/60 py-14 sm:py-16">
          <div className="mx-auto max-w-5xl px-5 sm:px-8">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-charcoal-400">
              Inside the app
            </h2>
            <p className="mt-2 max-w-lg text-[22px] font-bold leading-tight tracking-tight text-charcoal">
              Everything you need for the next tee time.
            </p>

            <ul className="mt-10 flex gap-5 overflow-x-auto pb-2 pt-1 [-ms-overflow-style:none] [scrollbar-width:none] snap-x snap-mandatory md:grid md:grid-cols-2 md:gap-6 md:overflow-visible md:snap-none lg:grid-cols-4 [&::-webkit-scrollbar]:hidden">
              {gallery.map((item) => (
                <li
                  key={item.src}
                  className="w-[min(78vw,240px)] shrink-0 snap-center md:w-auto"
                >
                  <DeviceShot src={item.src} alt={`Parfade ${item.label} screen: ${item.caption}`} />
                  <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.07em] text-charcoal-400">
                    {item.label}
                  </p>
                  <p className="mt-1 text-[14px] font-semibold leading-snug text-charcoal">
                    {item.caption}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="rounded-3xl border border-[#ece8e1] bg-fairway px-6 py-10 text-center shadow-[0_12px_40px_-12px_rgba(26,60,42,0.35)] sm:px-10 sm:py-12">
            <h2 className="text-balance text-[1.35rem] font-bold leading-tight text-cream-100 sm:text-2xl">
              Ready when your group is.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-white/85">
              Get the iOS app for the full experience, or start on the web—same account, same rounds.
            </p>
            <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:flex-wrap">
              {appStoreUrl ? (
                <a
                  href={appStoreUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-[50px] items-center justify-center rounded-2xl bg-cream-100 px-6 text-[15px] font-bold text-fairway transition hover:bg-white active:scale-[0.99]"
                >
                  App Store
                </a>
              ) : null}
              <Link
                href={"/sign-up" as never}
                className="inline-flex h-[50px] items-center justify-center rounded-2xl border border-white/35 bg-white/10 px-6 text-[15px] font-bold text-cream-100 backdrop-blur-sm transition hover:bg-white/15 active:scale-[0.99]"
              >
                Create account
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#ece8e1] px-5 py-8 sm:px-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 text-center text-[13px] text-charcoal-400 sm:flex-row sm:text-left">
          <ParfadeWordmark widthPx={100} className="opacity-90" />
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 sm:justify-end">
            <Link href="/support" className="font-semibold text-charcoal-500 transition hover:text-fairway">
              Support
            </Link>
            <span className="text-charcoal-200" aria-hidden>
              ·
            </span>
            <p>© {new Date().getFullYear()} Parfade</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
