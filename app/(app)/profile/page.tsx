import { UserProfile } from "@clerk/nextjs";
import { clerkParfadeAppearance } from "@/lib/clerk-parfade-appearance";

export default function ProfilePage() {
  return (
    <section className="space-y-6 pb-2">
      <div>
        <h1 className="parfade-page-title">Profile</h1>
        <p className="parfade-page-sub">
          Account, security, and preferences — stats and rounds sync with the Parfade app.
        </p>
      </div>

      <div className="parfade-card overflow-hidden p-0">
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
