import Link from "next/link";
import { AdminNav } from "@/components/admin-nav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <section className="min-h-[calc(100dvh-52px)] bg-[#faf8f5] lg:min-h-[calc(100dvh-56px)]">
      <div className="grid grid-cols-1">
        <aside className="border-b border-[#ece8e1] bg-[#f4f1ea] p-4 lg:fixed lg:bottom-0 lg:left-0 lg:top-14 lg:w-[260px] lg:overflow-y-auto lg:border-b-0 lg:border-r lg:p-5">
          <div className="space-y-5">
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
        <div className="p-5 lg:ml-[260px] lg:p-8">
          <div className="mx-auto w-full max-w-3xl xl:max-w-4xl">{children}</div>
        </div>
      </div>
    </section>
  );
}
