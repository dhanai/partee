import Link from "next/link";

export default function MarketingPage() {
  return (
    <main className="partee-shell">
      <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <p className="mb-2 text-sm font-medium uppercase tracking-wide text-putting">
          Partee
        </p>
        <h1 className="mb-4 text-3xl font-semibold text-fairway">
          Golf rounds, made social.
        </h1>
        <p className="mb-8 text-slate-600">
          Create rounds, invite your foursome, and find public tee times nearby.
        </p>
        <div className="flex gap-3">
          <Link
            href="/dashboard"
            className="rounded-lg bg-fairway px-4 py-2 font-medium text-white"
          >
            Go to dashboard
          </Link>
          <Link
            href="/discover"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium text-slate-800"
          >
            Discover rounds
          </Link>
        </div>
      </div>
    </main>
  );
}
