import Image from "next/image";
import Link from "next/link";
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { courses, rounds, spots } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/utils";
import { resolveRoundImageUrl } from "@/lib/round-images";

export default async function DashboardPage() {
  const user = await requireDbUser();
  const now = new Date();

  const hosting = await db
    .select({
      id: rounds.id,
      mode: rounds.mode,
      preferredTimeWindow: rounds.preferredTimeWindow,
      courseName: rounds.courseName,
      teeTime: rounds.teeTime,
      targetDate: rounds.targetDate,
      inviteToken: rounds.inviteToken,
      customImageUrl: rounds.customImageUrl,
      courseMetadata: courses.metadata,
    })
    .from(rounds)
    .leftJoin(courses, eq(courses.id, rounds.courseId))
    .where(eq(rounds.hostId, user.id))
    .orderBy(asc(rounds.targetDate));

  const joined = await db
    .select({
      id: rounds.id,
      mode: rounds.mode,
      preferredTimeWindow: rounds.preferredTimeWindow,
      courseName: rounds.courseName,
      teeTime: rounds.teeTime,
      targetDate: rounds.targetDate,
      inviteToken: rounds.inviteToken,
      customImageUrl: rounds.customImageUrl,
      courseMetadata: courses.metadata,
    })
    .from(spots)
    .innerJoin(rounds, eq(rounds.id, spots.roundId))
    .leftJoin(courses, eq(courses.id, rounds.courseId))
    .where(
      and(
        eq(spots.userId, user.id),
        ne(rounds.hostId, user.id),
      ),
    )
    .orderBy(asc(rounds.targetDate));

  const hostingWithImages = hosting.map((round) => ({
    ...round,
    mode: round.mode,
    courseName: round.courseName ?? "Course TBD",
    effectiveDate: round.teeTime ?? round.targetDate,
    imageUrl: resolveRoundImageUrl({
      customImageUrl: round.customImageUrl,
      courseMetadata: round.courseMetadata,
    }),
  }))
  .filter((round) => new Date(round.effectiveDate) >= now);

  const joinedWithImages = joined.map((round) => ({
    ...round,
    mode: round.mode,
    courseName: round.courseName ?? "Course TBD",
    effectiveDate: round.teeTime ?? round.targetDate,
    imageUrl: resolveRoundImageUrl({
      customImageUrl: round.customImageUrl,
      courseMetadata: round.courseMetadata,
    }),
  }))
  .filter((round) => new Date(round.effectiveDate) >= now);

  return (
    <section className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tightest text-charcoal">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-charcoal-400">Your upcoming rounds.</p>
        </div>
        <Link href="/create" className="partee-btn-primary">
          + New round
        </Link>
      </div>

      <RoundSection label="Hosting" rounds={hostingWithImages} />
      <RoundSection label="Joined" rounds={joinedWithImages} />
    </section>
  );
}

function RoundSection({
  label,
  rounds,
}: {
  label: string;
  rounds: Array<{
    id: string;
    mode: "scheduled" | "planning";
    preferredTimeWindow: "morning" | "afternoon" | "twilight" | null;
    courseName: string;
    effectiveDate: Date;
    inviteToken: string;
    imageUrl: string;
  }>;
}) {
  function formatPlanningWindow(
    value: "morning" | "afternoon" | "twilight" | null | undefined,
  ) {
    if (!value) return "Time TBD";
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  return (
    <section>
      <p className="partee-label">{label}</p>
      {rounds.length === 0 ? (
        <div className="partee-card text-center text-sm text-charcoal-300">
          No {label.toLowerCase()} rounds yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {rounds.map((round) => (
            <li key={round.id}>
              <Link
                href={`/round/${round.inviteToken}`}
                className="partee-card flex items-center gap-4 transition hover:shadow-md"
              >
                <Image
                  src={round.imageUrl}
                  alt={round.courseName}
                  width={72}
                  height={72}
                  className="h-[72px] w-[72px] rounded-xl object-cover"
                />
                <div>
                  <p className="font-semibold text-charcoal">{round.courseName}</p>
                  <p className="mt-0.5 text-sm text-charcoal-400">
                    {round.mode === "planning"
                      ? `${new Date(round.effectiveDate).toLocaleDateString()} (${formatPlanningWindow(round.preferredTimeWindow)})`
                      : formatDateTime(round.effectiveDate)}
                  </p>
                </div>
                <span className="ml-auto text-charcoal-300">&rsaquo;</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
