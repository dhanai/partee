import Link from "next/link";

export default function MarketingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-fairway px-6">
      <div className="max-w-md text-center">
        <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-fairway-300">
          Partee
        </p>
        <h1 className="mb-3 text-4xl font-bold tracking-tightest text-white sm:text-5xl">
          Golf rounds,
          <br />
          made social.
        </h1>
        <p className="mb-10 text-base leading-relaxed text-fairway-200">
          Create a round, blast invites to your crew, and let the first to
          claim lock in their spot. Simple as that.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/dashboard" className="partee-btn bg-white text-fairway font-semibold hover:bg-cream-200">
            Open dashboard
          </Link>
          <Link href="/discover" className="partee-btn border border-white/20 text-white hover:bg-white/10">
            Discover rounds
          </Link>
        </div>
      </div>
    </main>
  );
}
