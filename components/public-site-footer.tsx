import Link from "next/link";
import { ParfadeWordmark } from "@/components/parfade-wordmark";

export function PublicSiteFooter() {
  return (
    <footer className="border-t border-[#ece8e1] px-5 py-8 sm:px-8 lg:px-10 xl:px-12">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 text-center text-[13px] text-charcoal-400 sm:flex-row sm:text-left">
        <Link href="/" className="inline-flex" aria-label="Parfade home">
          <ParfadeWordmark widthPx={100} className="opacity-90" />
        </Link>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 sm:justify-end">
          <Link href="/support" className="font-semibold text-charcoal-500 transition hover:text-fairway">
            Support
          </Link>
          <span className="text-charcoal-200" aria-hidden>
            ·
          </span>
          <Link href="/privacy" className="font-semibold text-charcoal-500 transition hover:text-fairway">
            Privacy Policy
          </Link>
          <span className="text-charcoal-200" aria-hidden>
            ·
          </span>
          <p>© {new Date().getFullYear()} Parfade</p>
        </div>
      </div>
    </footer>
  );
}
