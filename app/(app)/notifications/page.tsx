"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ParfadeLoadingBlock, ParfadeSpinner } from "@/components/parfade-spinner";

type MineRound = {
  id: string;
  inviteToken: string;
  courseName: string | null;
  teeTime: string | null;
  targetDate: string;
  mode: "scheduled" | "planning";
  preferredTimeWindow: "morning" | "afternoon" | "twilight" | null;
  spotStatus: string;
};

type FollowRequest = {
  id: string;
  followerId: string;
  name: string;
  avatar: string | null;
  createdAt: string;
};

type ActivityItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  inviteToken: string;
  createdAt: string;
};

async function markNotificationsSeen() {
  try {
    await fetch("/api/users/me/notification-badge", { method: "POST" });
  } catch {
    /* ignore */
  }
}

function formatInviteWhen(round: MineRound) {
  const effectiveDate = new Date(round.teeTime ?? round.targetDate);
  const dateText = effectiveDate.toLocaleDateString();
  if (round.mode === "scheduled" && round.teeTime) {
    return `${dateText} at ${new Date(round.teeTime).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    })}`;
  }
  if (round.mode === "planning") {
    const slot = round.preferredTimeWindow
      ? `${round.preferredTimeWindow.charAt(0).toUpperCase()}${round.preferredTimeWindow.slice(1)}`
      : "Time TBD";
    return slot;
  }
  const slot = round.preferredTimeWindow
    ? `${round.preferredTimeWindow.charAt(0).toUpperCase()}${round.preferredTimeWindow.slice(1)}`
    : "Time TBD";
  return `${dateText} · ${slot}`;
}

export default function NotificationsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteRounds, setInviteRounds] = useState<MineRound[]>([]);
  const [followRequests, setFollowRequests] = useState<FollowRequest[]>([]);
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [requestBusyId, setRequestBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [mineRes, followRes, activityRes] = await Promise.allSettled([
      fetch("/api/rounds/mine?tab=joined&limit=50&includeInvited=1"),
      fetch("/api/users/me/follow-requests"),
      fetch("/api/users/me/activity-notifications"),
    ]);

    if (mineRes.status === "fulfilled" && mineRes.value.ok) {
      const data = (await mineRes.value.json()) as { rounds?: MineRound[] };
      const rounds = data.rounds ?? [];
      setInviteRounds(
        rounds.filter((r) => r.spotStatus === "invited" || r.spotStatus === "requested"),
      );
    } else {
      setInviteRounds([]);
    }

    if (followRes.status === "fulfilled" && followRes.value.ok) {
      const data = (await followRes.value.json()) as { requests?: FollowRequest[] };
      setFollowRequests(data.requests ?? []);
    } else {
      setFollowRequests([]);
    }

    if (activityRes.status === "fulfilled" && activityRes.value.ok) {
      const data = (await activityRes.value.json()) as { items?: ActivityItem[] };
      setActivityItems(data.items ?? []);
    } else {
      setActivityItems([]);
    }

    const anyOk = [mineRes, followRes, activityRes].some(
      (r) => r.status === "fulfilled" && r.value.ok,
    );
    if (!anyOk) {
      setError("Unable to load notifications.");
    }

    await markNotificationsSeen();
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleFollowAction(followerId: string, action: "approve" | "decline") {
    setRequestBusyId(followerId);
    try {
      const res = await fetch(`/api/users/me/follow-requests/${followerId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "Request failed.");
      }
      setFollowRequests((prev) => prev.filter((r) => r.followerId !== followerId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update follow request.");
    } finally {
      setRequestBusyId(null);
    }
  }

  const empty =
    !loading &&
    inviteRounds.length === 0 &&
    followRequests.length === 0 &&
    activityItems.length === 0;

  return (
    <section className="space-y-6 pb-10">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard"
          className="text-sm font-semibold text-[#1a3c2a] underline-offset-2 hover:underline"
        >
          ← My rounds
        </Link>
      </div>
      <div>
        <h1 className="parfade-page-title">Notifications</h1>
        <p className="parfade-page-sub">Invites, follow requests, and round updates.</p>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      {loading ? <ParfadeLoadingBlock className="py-8" size="md" /> : null}

      {!loading && activityItems.length > 0 ? (
        <div className="space-y-2">
          <p className="parfade-label">Round updates</p>
          <ul className="space-y-2">
            {activityItems.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/round/${item.inviteToken}`}
                  className="block rounded-2xl border border-[#ece8e1] bg-white p-4 shadow-sm transition hover:bg-[#faf8f5]"
                >
                  <p className="font-semibold text-[#1c1c1e]">{item.title}</p>
                  <p className="mt-1 text-sm text-[#6e6e6e]">{item.body}</p>
                  <span
                    className={`mt-2 inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${
                      item.type === "round_rsvp_declined"
                        ? "bg-[#f1efea] text-[#6e6e6e]"
                        : "bg-[#edf4ef] text-[#1a3c2a]"
                    }`}
                  >
                    {item.type === "round_rsvp_declined" ? "Declined" : "RSVP"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!loading && followRequests.length > 0 ? (
        <div className="space-y-2">
          <p className="parfade-label">Follow requests</p>
          <ul className="space-y-2">
            {followRequests.map((request) => (
              <li
                key={request.id}
                className="rounded-2xl border border-[#ece8e1] bg-white p-4 shadow-sm"
              >
                <div className="flex gap-3">
                  {request.avatar ? (
                    <Image
                      src={request.avatar}
                      alt=""
                      width={44}
                      height={44}
                      className="h-11 w-11 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#edf4ef] text-sm font-bold text-[#1a3c2a]">
                      {request.name.trim().charAt(0).toUpperCase() || "?"}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[#1c1c1e]">{request.name}</p>
                    <p className="text-sm text-[#6e6e6e]">Wants to follow your profile</p>
                  </div>
                </div>
                {requestBusyId === request.followerId ? (
                  <div className="mt-3 flex justify-center py-1">
                    <ParfadeSpinner size="sm" />
                  </div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleFollowAction(request.followerId, "approve")}
                      className="parfade-btn-primary flex-1 py-2.5 text-sm"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleFollowAction(request.followerId, "decline")}
                      className="parfade-btn-secondary flex-1 py-2.5 text-sm"
                    >
                      Decline
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!loading && inviteRounds.length > 0 ? (
        <div className="space-y-2">
          <p className="parfade-label">Round invites</p>
          <ul className="space-y-2">
            {inviteRounds.map((round) => (
              <li key={round.id}>
                <Link
                  href={`/round/${round.inviteToken}`}
                  className="block rounded-2xl border border-[#ece8e1] bg-white p-4 shadow-sm transition hover:bg-[#faf8f5]"
                >
                  <p className="font-semibold text-[#1c1c1e]">
                    {round.courseName ?? "Round invite"}
                  </p>
                  <p className="mt-1 text-sm text-[#6e6e6e]">{formatInviteWhen(round)}</p>
                  <span className="mt-2 inline-block rounded-full bg-[#edf4ef] px-2.5 py-1 text-xs font-semibold text-[#1a3c2a]">
                    {round.spotStatus === "requested" ? "Request pending" : "Invited"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {empty ? (
        <div className="parfade-card space-y-2">
          <p className="font-semibold text-[#1c1c1e]">All caught up</p>
          <p className="text-sm text-[#6e6e6e]">
            No invites, follow requests, or round updates right now.
          </p>
        </div>
      ) : null}
    </section>
  );
}
