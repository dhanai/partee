import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="min-h-screen bg-cream">
      <header className="sticky top-0 z-30 bg-cream/80 backdrop-blur-lg">
        <div className="partee-shell flex items-center justify-between py-4">
          <Link
            href="/dashboard"
            className="text-xl font-bold tracking-tightest text-fairway"
          >
            Partee
          </Link>
          <nav className="flex items-center gap-5">
            <Link
              href="/create"
              className="text-sm font-medium text-charcoal-400 transition-colors hover:text-fairway"
            >
              Create
            </Link>
            <Link
              href="/discover"
              className="text-sm font-medium text-charcoal-400 transition-colors hover:text-fairway"
            >
              Discover
            </Link>
            <UserButton
              afterSignOutUrl="/"
              appearance={{
                elements: {
                  avatarBox: "h-8 w-8 ring-2 ring-fairway-100",
                },
              }}
            />
          </nav>
        </div>
        <div className="mx-5 h-px bg-gradient-to-r from-transparent via-charcoal-100 to-transparent" />
      </header>
      <div className="partee-shell">{children}</div>
    </main>
  );
}
