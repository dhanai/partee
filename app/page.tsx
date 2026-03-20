export default function MarketingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0f2418] px-6">
      <div className="max-w-lg text-center">
        {/* Matches Expo <ParteeLogo tone="light" size="large" /> */}
        <div className="mb-5 flex items-center justify-center gap-2.5">
          <span
            className="h-[13px] w-[13px] shrink-0 rounded-full bg-[#c9a227]"
            aria-hidden
          />
          <span className="text-[24px] font-bold tracking-[-0.03em] text-[#f4f1ea]">
            Partee
          </span>
        </div>
        <p className="text-balance text-3xl font-medium leading-[1.15] tracking-[-0.02em] text-[#f8f6f1] sm:text-[2.5rem] sm:leading-[1.12] [text-shadow:0_1px_10px_rgba(0,0,0,0.25)]">
          Golf plans without the group text chaos.
        </p>
      </div>
    </main>
  );
}
