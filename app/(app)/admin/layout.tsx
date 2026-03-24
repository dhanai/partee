import Link from "next/link";
import { AdminNav } from "@/components/admin-nav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <section className="min-h-[calc(100dvh-52px)] lg:min-h-[calc(100dvh-56px)]">
      <div className="grid min-h-inherit grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="border-b border-[#ece8e1] bg-[#f4f1ea] p-4 lg:border-b-0 lg:border-r lg:p-5">
          <div className="sticky top-[72px] space-y-5">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#6e6e6e]">Parfade Admin</p>
              <p className="mt-1 text-sm text-[#6e6e6e]">Content, metadata, promos, and user controls.</p>
            </div>
            <AdminNav />
            <div className="pt-3">
              <Link href="/settings" className="text-xs font-semibold text-[#1a3c2a] underline hover:opacity-80">
                Back to settings
              </Link>
            </div>
          </div>
        </aside>
        <div className="bg-[#faf8f5] p-5 lg:p-8">{children}</div>
      </div>
    </section>
  );
}
