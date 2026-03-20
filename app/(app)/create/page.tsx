"use client";

import { FormEvent, useMemo, useState } from "react";

type CourseResult = {
  id: string;
  name: string;
  address: string;
};

type UserSearchResult = {
  id: string;
  name: string;
  email: string | null;
  avatar: string | null;
};

type CreateRoundResponse = {
  round: {
    id: string;
    inviteToken: string;
  };
  invitePath: string;
  invitedCount: number;
};

export default function CreateRoundPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CourseResult[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<CourseResult | null>(null);
  const [friendQuery, setFriendQuery] = useState("");
  const [friendResults, setFriendResults] = useState<UserSearchResult[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [selectedFriends, setSelectedFriends] = useState<UserSearchResult[]>([]);
  const [teeTime, setTeeTime] = useState("");
  const [totalSpots, setTotalSpots] = useState(4);
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [joinPolicy, setJoinPolicy] = useState<"instant" | "approval">("instant");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdInvitePath, setCreatedInvitePath] = useState<string | null>(null);
  const [createdInvitedCount, setCreatedInvitedCount] = useState<number>(0);

  const canSubmit = useMemo(
    () => Boolean(selectedCourse && teeTime && !submitting),
    [selectedCourse, teeTime, submitting],
  );

  async function runSearch() {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoadingCourses(true);
    setError(null);
    try {
      const response = await fetch("/api/courses/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const json = (await response.json()) as { courses: CourseResult[]; error?: string };
      if (!response.ok) {
        throw new Error(json.error ?? "Failed to search courses.");
      }
      setResults(json.courses);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Search failed.");
    } finally {
      setLoadingCourses(false);
    }
  }

  async function runFriendSearch() {
    if (friendQuery.trim().length < 2) {
      setFriendResults([]);
      return;
    }
    setLoadingFriends(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: friendQuery.trim() });
      const response = await fetch(`/api/users/search?${params.toString()}`);
      const json = (await response.json()) as {
        users: UserSearchResult[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(json.error ?? "Failed to search friends.");
      }
      setFriendResults(
        json.users.filter(
          (user) => !selectedFriends.some((selected) => selected.id === user.id),
        ),
      );
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Search failed.");
    } finally {
      setLoadingFriends(false);
    }
  }

  function addFriend(friend: UserSearchResult) {
    if (selectedFriends.some((f) => f.id === friend.id)) {
      return;
    }
    setSelectedFriends((prev) => [...prev, friend]);
    setFriendResults((prev) => prev.filter((f) => f.id !== friend.id));
  }

  function removeFriend(friendId: string) {
    setSelectedFriends((prev) => prev.filter((friend) => friend.id !== friendId));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCourse) {
      setError("Please select a course.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setCreatedInvitePath(null);
    setCreatedInvitedCount(0);
    try {
      const response = await fetch("/api/rounds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: selectedCourse.id,
          teeTime: new Date(teeTime).toISOString(),
          totalSpots,
          visibility,
          joinPolicy,
          inviteeUserIds: selectedFriends.map((friend) => friend.id),
        }),
      });
      const json = (await response.json()) as CreateRoundResponse & { error?: string };
      if (!response.ok) {
        throw new Error(json.error ?? "Failed to create round.");
      }
      setCreatedInvitePath(json.invitePath);
      setCreatedInvitedCount(json.invitedCount);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Create round failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-fairway">Create a round</h1>
        <p className="mt-1 text-sm text-slate-600">
          Pick a course, tee time, and how players can join.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
      >
        <label className="block text-sm font-medium text-slate-700">
          Course search
          <div className="mt-1 flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Search golf courses"
            />
            <button
              type="button"
              onClick={runSearch}
              className="rounded-lg bg-fairway px-3 py-2 text-sm font-medium text-white"
              disabled={loadingCourses}
            >
              {loadingCourses ? "Searching..." : "Search"}
            </button>
          </div>
        </label>

        {results.length > 0 && (
          <ul className="max-h-44 overflow-auto rounded-lg border border-slate-200">
            {results.map((course) => (
              <li key={course.id}>
                <button
                  type="button"
                  className="w-full border-b border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50"
                  onClick={() => setSelectedCourse(course)}
                >
                  <span className="block font-medium text-slate-800">{course.name}</span>
                  <span className="block text-xs text-slate-500">{course.address}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {selectedCourse && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Selected: {selectedCourse.name}
          </p>
        )}

        <label className="block text-sm font-medium text-slate-700">
          Tee time
          <input
            type="datetime-local"
            value={teeTime}
            onChange={(e) => setTeeTime(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            required
          />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Invite friends on Partee
          <div className="mt-1 flex gap-2">
            <input
              value={friendQuery}
              onChange={(e) => setFriendQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Search by name or email"
            />
            <button
              type="button"
              onClick={runFriendSearch}
              className="rounded-lg bg-fairway px-3 py-2 text-sm font-medium text-white"
              disabled={loadingFriends}
            >
              {loadingFriends ? "Searching..." : "Find"}
            </button>
          </div>
        </label>

        {friendResults.length > 0 && (
          <ul className="max-h-40 overflow-auto rounded-lg border border-slate-200">
            {friendResults.map((friend) => (
              <li key={friend.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between border-b border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50"
                  onClick={() => addFriend(friend)}
                >
                  <span>
                    <span className="block font-medium text-slate-800">{friend.name}</span>
                    {friend.email && (
                      <span className="block text-xs text-slate-500">{friend.email}</span>
                    )}
                  </span>
                  <span className="text-xs text-fairway">Add</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {selectedFriends.length > 0 && (
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              Will receive invite blast ({selectedFriends.length})
            </p>
            <ul className="space-y-2">
              {selectedFriends.map((friend) => (
                <li key={friend.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700">
                    {friend.name}
                    {friend.email ? ` (${friend.email})` : ""}
                  </span>
                  <button
                    type="button"
                    className="text-rose-600 hover:underline"
                    onClick={() => removeFriend(friend.id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <label className="block text-sm font-medium text-slate-700">
          Total spots
          <select
            value={totalSpots}
            onChange={(e) => setTotalSpots(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value={2}>2 players</option>
            <option value={3}>3 players</option>
            <option value={4}>4 players</option>
          </select>
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            Visibility
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as "private" | "public")}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="private">Private (invite-only)</option>
              <option value="public">Public (discoverable)</option>
            </select>
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Join policy
            <select
              value={joinPolicy}
              onChange={(e) => setJoinPolicy(e.target.value as "instant" | "approval")}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="instant">Instant claim</option>
              <option value="approval">Host approval required</option>
            </select>
          </label>
        </div>

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-lg bg-putting px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Creating..." : "Create round"}
        </button>
      </form>

      {createdInvitePath && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <p className="font-medium">Round created.</p>
          {createdInvitedCount > 0 && (
            <p className="mt-1">Invite blast sent to {createdInvitedCount} golfers on Partee.</p>
          )}
          <p className="mt-1">
            Share this invite:
            <a href={createdInvitePath} className="ml-2 underline">
              {createdInvitePath}
            </a>
          </p>
        </div>
      )}
    </section>
  );
}
