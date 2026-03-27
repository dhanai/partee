"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/admin/promos", label: "House promos" },
  { href: "/admin/games", label: "Games" },
  { href: "/admin/feed", label: "App settings" },
  { href: "/admin/site-meta", label: "Site metadata" },
  { href: "/admin/content", label: "Content" },
  { href: "/admin/users", label: "Users" },
];

export function AdminNav({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  return (
    <nav className={compact ? "flex flex-wrap items-center gap-2" : "flex flex-col gap-1"}>
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname?.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href as Route}
            className={
              active
                ? compact
                  ? "rounded-full border border-[#1a3c2a] bg-[#edf4ef] px-3 py-1.5 text-xs font-bold text-[#1a3c2a]"
                  : "rounded-lg border border-[#1a3c2a] bg-[#edf4ef] px-3 py-2 text-sm font-bold text-[#1a3c2a]"
                : compact
                  ? "rounded-full border border-[#ece8e1] bg-white px-3 py-1.5 text-xs font-semibold text-[#494949] hover:border-[#d8d3cb]"
                  : "rounded-lg border border-transparent px-3 py-2 text-sm font-semibold text-[#494949] hover:border-[#ece8e1] hover:bg-white"
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
