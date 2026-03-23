import Link from "next/link";
import { AppTabBar } from "@/components/app-tab-bar";
import { ParfadeWordmark } from "@/components/parfade-wordmark";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col bg-[#faf8f5] text-[#1c1c1e] antialiased">
      <header className="sticky top-0 z-30 flex h-[52px] shrink-0 items-center border-b border-[#ece8e1] bg-[#faf8f5]/95 px-5 backdrop-blur-md sm:px-6">
        <Link
          href="/discover"
          className="-ml-0.5 block shrink-0 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a3c2a]/30"
          aria-label="Parfade home"
        >
          <ParfadeWordmark widthPx={109} className="block" />
        </Link>
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 px-5 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] pt-4 sm:max-w-2xl sm:px-6">
        {children}
      </main>
      <AppTabBar />
    </div>
  );
}
