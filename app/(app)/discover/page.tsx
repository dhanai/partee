"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

type DiscoverRound = {
  id: string;
  inviteToken: string;
  courseName: string;
  teeTime: string;
  hostName: string;
  spotsRemaining: number;
  distanceMiles: number | null;
  joinPolicy: "instant" | "approval";
  imageUrl: string;
};

export default function DiscoverPage() {
  const [date, setDate] = useState("");
  const [rounds, setRounds] = useState<DiscoverRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRounds = useCallback(async (filterDate?: string) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (filterDate) params.set("date", filterDate);

    try {
      const response = await fetch(`/api/rounds/discover?${params.toString()}`);
      const json = (await response.json()) as { rounds: DiscoverRound[]; error?: string };
      if (!response.ok) {
        throw new Error(json.error ?? "Failed to load rounds.");
      }
      setRounds(json.rounds);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRounds();
  }, [loadRounds]);

  function handleDateChange(value: string) {
    setDate(value);
    loadRounds(value || undefined);
  }

  function clearDate() {
    setDate("");
    loadRounds();
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tightest text-charcoal">
          Discover
        </h1>
        <p className="mt-1 text-sm text-charcoal-400">
          Open rounds looking for players.
        </p>
      </div>

      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
        <input
          type="date"
          value={date}
          onChange={(e) => handleDateChange(e.target.value)}
          className="partee-input w-full sm:max-w-[190px]"
        />
        {date && (
          <button
            type="button"
            onClick={clearDate}
            className="text-sm font-medium text-fairway"
          >
            Clear
          </button>
        )}
      </div>

      {error && (
        <p className="partee-card text-sm text-red-600">{error}</p>
      )}

      {loading && (
        <p className="text-sm text-charcoal-300">Loading...</p>
      )}

      {!loading && rounds.length === 0 && (
        <div className="partee-card text-center text-sm text-charcoal-300">
          No open rounds{date ? ` on ${date}` : ""} right now.
        </div>
      )}

      <ul className="space-y-3">
        {rounds.map((round) => (
          <li key={round.id}>
            <Link
              href={`/round/${round.inviteToken}`}
              className="partee-card block p-4 transition hover:shadow-md sm:p-5"
            >
              <div className="space-y-3">
                <Image
                  src={round.imageUrl}
                  alt={round.courseName}
                  width={1200}
                  height={700}
                  className="h-40 w-full rounded-2xl object-cover"
                />
                <div className="space-y-1">
                  <p className="text-xl font-semibold leading-tight text-charcoal">
                    {round.courseName}
                  </p>
                  <p className="text-base text-charcoal-400">
                    {new Date(round.teeTime).toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    at{" "}
                    {new Date(round.teeTime).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                  <p className="text-sm text-charcoal-300">Hosted by {round.hostName}</p>
                </div>
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-fairway-50 px-3 py-1 text-sm font-semibold text-fairway">
                    {round.spotsRemaining} spot{round.spotsRemaining !== 1 ? "s" : ""}
                  </span>
                  <span className="rounded-full bg-cream-200 px-3 py-1 text-xs font-medium text-charcoal-400">
                    {round.joinPolicy === "instant"
                      ? "Instant claim"
                      : "Host approval"}
                  </span>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
