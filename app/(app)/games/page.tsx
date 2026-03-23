import Link from "next/link";
import { requireDbUser } from "@/lib/auth";
import {
  GAME_DEFINITIONS,
  type GameDefinition,
  getGameDefinition,
} from "@/lib/games-registry";
import { missingGamesSchemaMessage, serializeGameSessionForApi } from "@/lib/games/serialize";
import { listSessionsForUser } from "@/lib/games/session-queries";

function statusLabel(s: string) {
  if (s === "active") return "Active";
  if (s === "completed") return "Done";
  return "Abandoned";
}

function formatSessionListDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === now.getFullYear()
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" };
  return d.toLocaleDateString("en-US", opts);
}

function GameStartCard({ g }: { g: GameDefinition }) {
  const body = (
    <>
      <span
        className="flex h-[22px] w-[22px] items-center justify-center text-[#1a3c2a]"
        aria-hidden
      >
        {g.implemented ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.75" />
            <path
              d="M4 20v-2a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v2M15 11h5M17.5 8.5v5"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-charcoal-400">
            <path
              d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-9Z"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      <span className="text-[17px] font-bold text-charcoal">{g.title}</span>
      <span className="text-xs leading-4 text-charcoal-400">{g.subtitle}</span>
      {!g.implemented ? (
        <span className="mt-1 text-[11px] font-semibold text-charcoal-400">Coming soon</span>
      ) : null}
    </>
  );

  const cardClass =
    "flex min-w-[150px] flex-1 basis-[calc(50%-5px)] flex-col gap-1.5 rounded-[14px] border border-[#ece8e1] bg-white p-3 transition hover:opacity-95 active:scale-[0.99]";

  if (!g.implemented) {
    return <div className={`${cardClass} opacity-80`}>{body}</div>;
  }

  return (
    <a
      href={`parfade://games/create?gameType=${g.id}`}
      className={cardClass}
    >
      {body}
    </a>
  );
}

export default async function GamesPage() {
  const sessions: ReturnType<typeof serializeGameSessionForApi>[] = [];
  let schemaError: string | null = null;

  try {
    const user = await requireDbUser();
    const rows = await listSessionsForUser(user.id, 50);
    for (const row of rows) {
      const { roundInviteToken, ...session } = row;
      sessions.push(
        serializeGameSessionForApi(session, {
          roundInviteToken: roundInviteToken ?? null,
        }),
      );
    }
  } catch (e) {
    const hint = missingGamesSchemaMessage(e);
    if (hint) {
      schemaError = hint;
    } else {
      throw e;
    }
  }

  return (
    <section className="space-y-6 pb-2">
      <div>
        <h1 className="parfade-page-title">Games</h1>
        <p className="parfade-page-sub">
          Side games with your group — start Skins, Wolf, or pick up where you left off.
        </p>
      </div>

      <div>
        <p className="parfade-label">Start a game</p>
        <div className="flex flex-wrap gap-2.5">{GAME_DEFINITIONS.map((g) => (
          <GameStartCard key={g.id} g={g} />
        ))}</div>
        <p className="mt-3 text-xs leading-snug text-charcoal-400">
          Live scoring runs in the Parfade app — tap a game to open it there.
        </p>
      </div>

      {schemaError ? (
        <p className="rounded-2xl border border-[#ece8e1] bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {schemaError}
        </p>
      ) : null}

      <div>
        <p className="parfade-label">Your sessions</p>
        {sessions.length === 0 ? (
          <p className="text-sm text-charcoal-400">
            No games yet — pick a format above.
          </p>
        ) : (
          <ul className="space-y-2">
            {sessions.map((s) => {
              const def = getGameDefinition(s.gameType);
              const meta = `${formatSessionListDate(s.startedAt || s.createdAt)} · ${s.holesCount} holes · ${statusLabel(s.status)}`;
              const appHref = `parfade://games/session/${s.id}`;
              return (
                <li key={s.id}>
                  <a
                    href={appHref}
                    className="flex items-center gap-3 rounded-xl border border-[#ece8e1] bg-white px-3.5 py-3 shadow-sm transition hover:bg-cream-50 active:opacity-90"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-bold text-charcoal">
                        {def?.title ?? s.gameType}
                      </p>
                      <p className="text-[13px] text-charcoal-400">{meta}</p>
                    </div>
                    <span className="shrink-0 text-charcoal-300" aria-hidden>
                      &rsaquo;
                    </span>
                  </a>
                  {s.roundInviteToken ? (
                    <p className="mt-1 pl-1 text-xs text-charcoal-400">
                      Round:{" "}
                      <Link
                        href={`/round/${s.roundInviteToken}`}
                        className="font-semibold text-[#1a3c2a] underline-offset-2 hover:underline"
                      >
                        open invite
                      </Link>
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
