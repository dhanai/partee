"use client";

import { UserProfile } from "@clerk/nextjs";
import type { Route } from "next";
import Link from "next/link";
import { clerkParfadeAppearance } from "@/lib/clerk-parfade-appearance";

export default function SettingsPage() {
  return (
    <section className="space-y-8 pb-8">
      <div className="flex items-center gap-3">
        <Link
          href="/profile"
          className="text-sm font-semibold text-[#1a3c2a] underline-offset-2 hover:underline"
        >
          ← Profile
        </Link>
      </div>
      <div>
        <h1 className="text-[28px] font-bold text-[#1c1c1e]">Settings</h1>
        <p className="mt-1 text-sm text-[#6e6e6e]">
          Account, email, and security. For photo, name, handicap, and location, use{" "}
          <Link
            href={"/profile/edit" as Route}
            className="font-semibold text-[#1a3c2a] underline-offset-2 hover:underline"
          >
            Edit profile
          </Link>
          .
        </p>
      </div>

      <div className="parfade-card overflow-hidden p-0">
        <p className="border-b border-[#ece8e1] px-4 py-3 text-sm font-semibold text-[#1c1c1e]">
          Account & security
        </p>
        <UserProfile
          routing="hash"
          appearance={{
            ...clerkParfadeAppearance,
            elements: {
              ...clerkParfadeAppearance.elements,
              rootBox: "w-full",
              card: "shadow-none border-0 rounded-none",
            },
          }}
        />
      </div>
    </section>
  );
}
