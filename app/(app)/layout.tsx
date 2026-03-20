import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="partee-shell flex items-center justify-between py-4">
          <Link href="/dashboard" className="text-lg font-semibold text-fairway">
            Partee
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/create" className="text-slate-700 hover:text-fairway">
              Create
            </Link>
            <Link href="/discover" className="text-slate-700 hover:text-fairway">
              Discover
            </Link>
            <UserButton afterSignOutUrl="/" />
          </nav>
        </div>
      </header>
      <div className="partee-shell">{children}</div>
    </main>
  );
}
