"use client";

import { useState } from "react";

type DiscoverRound = {
  id: string;
  inviteToken: string;
  courseName: string;
  teeTime: string;
  hostName: string;
  spotsRemaining: number;
  distanceMiles: number | null;
  joinPolicy: "instant" | "approval";
};

export default function DiscoverPage() {
  const [date, setDate] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [distanceMiles, setDistanceMiles] = useState("25");
  const [rounds, setRounds] = useState<DiscoverRound[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadRounds() {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (date) params.set("date", date);
    if (lat) params.set("lat", lat);
    if (lng) params.set("lng", lng);
    params.set("distanceMiles", distanceMiles);

    try {
      const response = await fetch(`/api/rounds/discover?${params.toString()}`);
      const json = (await response.json()) as { rounds: DiscoverRound[]; error?: string };
      if (!response.ok) {
        throw new Error(json.error ?? "Failed to load discover rounds.");
      }
      setRounds(json.rounds);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-fairway">Discover rounds</h1>
        <p className="text-sm text-slate-600">
          Find public rounds with open spots near you.
        </p>
      </div>

      <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="number"
            placeholder="Distance miles"
            value={distanceMiles}
            onChange={(e) => setDistanceMiles(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="number"
            placeholder="Your latitude"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="number"
            placeholder="Your longitude"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={loadRounds}
          disabled={loading}
          className="mt-3 rounded-lg bg-fairway px-4 py-2 text-sm font-medium text-white"
        >
          {loading ? "Loading..." : "Find rounds"}
        </button>
      </div>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      )}

      <ul className="space-y-3">
        {rounds.map((round) => (
          <li key={round.id} className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
            <p className="font-medium text-slate-900">{round.courseName}</p>
            <p className="text-sm text-slate-600">
              {new Date(round.teeTime).toLocaleString()} with {round.hostName}
            </p>
            <p className="text-sm text-slate-600">
              Spots left: {round.spotsRemaining} -{" "}
              {round.joinPolicy === "instant" ? "Instant claim" : "Host approval"}
            </p>
            {round.distanceMiles !== null && (
              <p className="text-sm text-slate-500">
                {round.distanceMiles.toFixed(1)} miles away
              </p>
            )}
            <a href={`/round/${round.inviteToken}`} className="text-sm text-fairway underline">
              View round
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
