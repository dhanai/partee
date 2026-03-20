import Link from "next/link";
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { rounds, spots } from "@/db/schema";
import { requireDbUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/utils";

export default async function DashboardPage() {
  const user = await requireDbUser();
  const now = new Date();

  const hosting = await db
    .select({
      id: rounds.id,
      courseName: rounds.courseName,
      teeTime: rounds.teeTime,
      inviteToken: rounds.inviteToken,
    })
    .from(rounds)
    .where(eq(rounds.hostId, user.id))
    .orderBy(asc(rounds.teeTime));

  const joined = await db
    .select({
      id: rounds.id,
      courseName: rounds.courseName,
      teeTime: rounds.teeTime,
      inviteToken: rounds.inviteToken,
      spotStatus: spots.status,
    })
    .from(spots)
    .innerJoin(rounds, eq(rounds.id, spots.roundId))
    .where(and(eq(spots.userId, user.id), ne(rounds.hostId, user.id)))
    .orderBy(asc(rounds.teeTime));

  const hostingUpcoming = hosting.filter((r) => new Date(r.teeTime) >= now);
  const hostingPast = hosting.filter((r) => new Date(r.teeTime) < now);
  const joinedUpcoming = joined.filter((r) => new Date(r.teeTime) >= now);
  const joinedPast = joined.filter((r) => new Date(r.teeTime) < now);

  return (
    <section className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-fairway">Dashboard</h1>
          <p className="text-sm text-slate-600">
            Rounds you host and rounds you have joined.
          </p>
        </div>
        <Link
          href="/create"
          className="rounded-lg bg-fairway px-4 py-2 text-sm font-medium text-white"
        >
          Create round
        </Link>
      </div>

      <RoundList title="Hosting (upcoming)" rounds={hostingUpcoming} />
      <RoundList title="Joined (upcoming)" rounds={joinedUpcoming} />
      <RoundList title="Hosting (past)" rounds={hostingPast} />
      <RoundList title="Joined (past)" rounds={joinedPast} />
    </section>
  );
}

function RoundList({
  title,
  rounds,
}: {
  title: string;
  rounds: Array<{ id: string; courseName: string; teeTime: Date; inviteToken: string }>;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
      {rounds.length === 0 ? (
        <p className="rounded-xl bg-white p-4 text-sm text-slate-600 ring-1 ring-slate-200">
          No rounds yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {rounds.map((round) => (
            <li
              key={round.id}
              className="rounded-xl bg-white p-4 ring-1 ring-slate-200"
            >
              <p className="font-medium text-slate-900">{round.courseName}</p>
              <p className="text-sm text-slate-600">{formatDateTime(round.teeTime)}</p>
              <Link
                href={`/round/${round.inviteToken}`}
                className="mt-2 inline-block text-sm text-fairway underline"
              >
                View invite
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
