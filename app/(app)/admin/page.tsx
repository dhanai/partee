import type { Route } from "next";
import Link from "next/link";

const cards = [
  {
    href: "/admin/promos",
    title: "House promos",
    body: "Control Discover ad slots and post-game promo creatives.",
  },
  {
    href: "/admin/site-meta",
    title: "Site metadata",
    body: "Update global title, description, and Open Graph/Twitter share images.",
  },
  {
    href: "/admin/content",
    title: "Content",
    body: "Manage homepage, support page, and privacy page copy from admin.",
  },
  {
    href: "/admin/users",
    title: "Users",
    body: "Search users and manage profile visibility plus moderation-level controls.",
  },
];

export default function AdminIndexPage() {
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-[30px] font-bold text-[#1c1c1e]">Admin dashboard</h1>
        <p className="mt-1 text-sm text-[#6e6e6e]">
          Configure growth surfaces, site metadata, and account governance from one place.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href as Route}
            className="rounded-xl border border-[#ece8e1] bg-white p-4 transition hover:border-[#d8d3cb]"
          >
            <p className="text-base font-bold text-[#1c1c1e]">{card.title}</p>
            <p className="mt-1 text-sm text-[#6e6e6e]">{card.body}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
