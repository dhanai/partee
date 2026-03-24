"use client";

import Image from "next/image";
import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ParfadeLoadingBlock, ParfadeSpinner } from "@/components/parfade-spinner";

type MeUser = {
  id: string;
  name: string;
  email: string | null;
  avatar: string | null;
  handicap: string | null;
  location: string | null;
  homeCourse: string | null;
};

type LocationResult = { label: string; city: string; state: string };

function snapshotFromFields(args: {
  name: string;
  handicap: string;
  location: string;
  avatar: string | null;
}) {
  return JSON.stringify({
    name: args.name.trim(),
    handicap: args.handicap.trim(),
    location: args.location.trim(),
    avatar: args.avatar ?? null,
  });
}

function useDebounce(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

const HCP_RE = /^\d{1,2}(\.\d{1,2})?$/;
const AVATAR_TARGET_BYTES = 3 * 1024 * 1024;
const AVATAR_MAX_BYTES = 12 * 1024 * 1024;
const AVATAR_ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const AVATAR_MAX_DIMENSION = 1600;

function fileExtensionFromMime(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "jpg";
}

async function fileToImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new window.Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not read image."));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not compress image."));
          return;
        }
        resolve(blob);
      },
      mime,
      quality,
    );
  });
}

async function compressAvatarForUpload(file: File): Promise<File> {
  if (file.size <= AVATAR_TARGET_BYTES) return file;

  const image = await fileToImage(file);
  const ratio = Math.min(
    1,
    AVATAR_MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight),
  );
  let width = Math.max(1, Math.round(image.naturalWidth * ratio));
  let height = Math.max(1, Math.round(image.naturalHeight * ratio));

  const outputMime =
    file.type === "image/jpeg" || file.type === "image/webp"
      ? file.type
      : "image/webp";
  const qualitySteps = [0.9, 0.82, 0.74, 0.66, 0.58, 0.5, 0.42];

  for (let i = 0; i < qualitySteps.length; i += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not process image.");
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    const blob = await canvasToBlob(canvas, outputMime, qualitySteps[i]);
    if (blob.size <= AVATAR_TARGET_BYTES) {
      const ext = fileExtensionFromMime(outputMime);
      const baseName = file.name.replace(/\.[a-z0-9]+$/i, "") || "avatar";
      return new File([blob], `${baseName}.${ext}`, { type: outputMime });
    }

    // If quality reductions are not enough, reduce dimensions for the next pass.
    width = Math.max(320, Math.round(width * 0.86));
    height = Math.max(320, Math.round(height * 0.86));
  }

  throw new Error("Could not compress image under 3MB. Try a smaller photo.");
}

export function ProfileEditScreenWeb() {
  const [loading, setLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [emailDisplay, setEmailDisplay] = useState("");
  const [handicap, setHandicap] = useState("");
  const [location, setLocation] = useState("");
  const [locationIsValidated, setLocationIsValidated] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [locationResults, setLocationResults] = useState<LocationResult[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [showLocationResults, setShowLocationResults] = useState(false);
  const locationRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const debouncedLocation = useDebounce(location, 320);
  const lastSavedSnapshotRef = useRef("");
  const saveRequestGenRef = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/users/me");
      const json = (await res.json()) as { user?: MeUser; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Unable to load profile.");
      const u = json.user;
      if (!u) throw new Error("Unable to load profile.");
      setName(u.name?.trim() ?? "");
      setEmailDisplay(u.email?.trim() ?? "");
      setHandicap(u.handicap?.trim() ?? "");
      const loc = u.location?.trim() ?? u.homeCourse?.trim() ?? "";
      setLocation(loc);
      setLocationIsValidated(true);
      setAvatarUrl(u.avatar);
      lastSavedSnapshotRef.current = snapshotFromFields({
        name: u.name?.trim() ?? "",
        handicap: u.handicap?.trim() ?? "",
        location: loc,
        avatar: u.avatar,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load profile.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (locationRef.current && !locationRef.current.contains(e.target as Node)) {
        setShowLocationResults(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    let active = true;
    async function searchLocations(q: string) {
      if (locationIsValidated) {
        if (!active) return;
        setLocationResults([]);
        setShowLocationResults(false);
        setLoadingLocations(false);
        return;
      }
      if (q.trim().length < 2) {
        if (!active) return;
        setLocationResults([]);
        setShowLocationResults(false);
        return;
      }
      setLoadingLocations(true);
      try {
        const res = await fetch("/api/locations/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q }),
        });
        const json = (await res.json()) as { locations: LocationResult[]; error?: string };
        if (!res.ok) throw new Error(json.error ?? "Location search failed.");
        if (!active) return;
        setLocationResults(json.locations);
        setShowLocationResults(true);
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Location search failed.");
      } finally {
        if (active) setLoadingLocations(false);
      }
    }
    void searchLocations(debouncedLocation);
    return () => {
      active = false;
    };
  }, [debouncedLocation, locationIsValidated]);

  const initials = useMemo(() => {
    const n = name.trim();
    if (!n) return "P";
    return n
      .split(" ")
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }, [name]);

  async function handlePhotoChange(file: File | null) {
    if (!file) return;
    if (!AVATAR_ALLOWED_TYPES.has(file.type)) {
      setError("Use JPG, PNG, WebP, or GIF.");
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setError("Image must be 12MB or smaller.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const uploadFile = await compressAvatarForUpload(file);
      const formData = new FormData();
      formData.append("file", uploadFile);
      const res = await fetch("/api/uploads/avatar", { method: "POST", body: formData });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        throw new Error(json.error ?? "Upload failed.");
      }
      setAvatarUrl(json.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    if (loading || uploading) return;
    const nextSnapshot = snapshotFromFields({
      name,
      handicap,
      location,
      avatar: avatarUrl,
    });
    if (nextSnapshot === lastSavedSnapshotRef.current) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setSaveNote(null);
      setProfileSaving(false);
      return;
    }

    const h = handicap.trim();
    if (h.length > 0 && !HCP_RE.test(h)) {
      setSaveNote(null);
      setProfileSaving(false);
      return;
    }

    if (location.trim().length > 0 && !locationIsValidated) {
      setSaveNote(null);
      setProfileSaving(false);
      return;
    }

    setSaveNote(null);
    const timer = setTimeout(async () => {
      const gen = ++saveRequestGenRef.current;
      setError(null);
      setProfileSaving(true);
      try {
        const res = await fetch("/api/users/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: trimmedName,
            handicap: h.length > 0 ? h : null,
            location: location.trim().length > 0 ? location.trim() : null,
            avatar: avatarUrl,
          }),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Could not save.");
        if (gen !== saveRequestGenRef.current) return;
        lastSavedSnapshotRef.current = snapshotFromFields({
          name: trimmedName,
          handicap: h,
          location: location.trim(),
          avatar: avatarUrl,
        });
        setLocationIsValidated(true);
        setProfileSaving(false);
        setSaveNote("Saved");
      } catch (err) {
        if (gen !== saveRequestGenRef.current) return;
        setError(err instanceof Error ? err.message : "Could not save.");
        setProfileSaving(false);
        setSaveNote("Save failed");
      }
    }, 650);
    return () => clearTimeout(timer);
  }, [
    loading,
    uploading,
    name,
    handicap,
    location,
    avatarUrl,
    locationIsValidated,
  ]);

  return (
    <section className="space-y-6 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={"/profile" as Route}
          className="inline-flex items-center gap-1 text-sm font-semibold text-[#1a3c2a]"
        >
          <span aria-hidden>&larr;</span> Profile
        </Link>
        {!loading && (profileSaving || saveNote != null) ? (
          <span
            className="rounded-full border border-[#ece8e1] bg-[#edf4ef] px-2.5 py-1 text-xs font-bold text-[#1a3c2a]"
            aria-live="polite"
          >
            {profileSaving ? "Saving…" : saveNote}
          </span>
        ) : null}
      </div>

      <div>
        <h1 className="parfade-page-title">Edit profile</h1>
        <p className="parfade-page-sub">
          Photo, name, handicap, and location save automatically after you stop typing. Email is managed
          with your sign-in provider.
        </p>
      </div>

      {loading ? (
        <ParfadeLoadingBlock className="py-12" message="Loading…" size="md" />
      ) : (
        <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,200px)_minmax(0,1fr)] lg:items-start lg:gap-10 xl:grid-cols-[minmax(0,220px)_minmax(0,1fr)] xl:gap-12">
          <div className="flex flex-col items-center gap-3 lg:items-center lg:self-start">
            <div className="relative h-[120px] w-[120px] overflow-hidden rounded-[22px] bg-white shadow-[0_8px_20px_rgba(0,0,0,0.12)]">
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt=""
                  width={240}
                  height={240}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[#edf4ef] text-3xl font-extrabold text-[#1a3c2a]">
                  {initials}
                </div>
              )}
              {uploading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/35">
                  <ParfadeSpinner size="md" variant="onPrimary" aria-label="Uploading" />
                </div>
              ) : null}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              onChange={(ev) => {
                const f = ev.target.files?.[0] ?? null;
                ev.target.value = "";
                void handlePhotoChange(f);
              }}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="text-sm font-semibold text-[#1a3c2a] underline-offset-2 hover:underline disabled:opacity-50"
            >
              {uploading ? "Uploading…" : "Upload new photo"}
            </button>
            <p className="text-center text-xs text-[#6e6e6e] lg:max-w-[200px]">
              JPG, PNG, WebP, or GIF · auto-compressed to &lt;=3MB (raw up to 12MB)
            </p>
          </div>

          <div className="min-w-0 space-y-4 rounded-[18px] border border-[#ece8e1] bg-white p-4 shadow-sm lg:p-5">
            <div>
              <label className="parfade-label" htmlFor="edit-name">
                Name
              </label>
              <input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="parfade-input"
                autoComplete="name"
                maxLength={120}
              />
            </div>

            <div>
              <label className="parfade-label" htmlFor="edit-email">
                Email
              </label>
              <input
                id="edit-email"
                value={emailDisplay}
                readOnly
                className="parfade-input cursor-not-allowed bg-[#f5f3ef] text-[#6e6e6e]"
                aria-readonly="true"
              />
              <p className="mt-1 text-xs text-[#6e6e6e]">
                To change your email, use <strong>Settings</strong> → Account (Clerk).
              </p>
            </div>

            <div>
              <label className="parfade-label" htmlFor="edit-hcp">
                Handicap
              </label>
              <input
                id="edit-hcp"
                value={handicap}
                onChange={(e) => setHandicap(e.target.value)}
                className="parfade-input"
                placeholder="e.g. 12.4"
                inputMode="decimal"
                maxLength={8}
              />
            </div>

            <div ref={locationRef} className="relative">
              <label className="parfade-label" htmlFor="edit-loc">
                Location
              </label>
              <input
                id="edit-loc"
                value={location}
                onChange={(e) => {
                  const v = e.target.value;
                  setLocation(v);
                  setLocationIsValidated(v.trim().length === 0);
                }}
                onFocus={() => locationResults.length > 0 && setShowLocationResults(true)}
                className="parfade-input"
                placeholder="Start typing a US city…"
                autoComplete="off"
              />
              {loadingLocations ? (
                <p className="mt-1 flex items-center gap-2 text-xs text-[#6e6e6e]">
                  <ParfadeSpinner size="xs" variant="muted" aria-hidden />
                  Searching…
                </p>
              ) : null}
              {showLocationResults && locationResults.length > 0 ? (
                <ul className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-xl border border-[#ece8e1] bg-white py-1 shadow-lg">
                  {locationResults.map((item) => (
                    <li key={`${item.city}-${item.state}-${item.label}`}>
                      <button
                        type="button"
                        className="w-full px-3 py-2.5 text-left text-sm transition hover:bg-[#faf8f5]"
                        onClick={() => {
                          setLocation(item.label);
                          setLocationIsValidated(true);
                          setShowLocationResults(false);
                          setLocationResults([]);
                        }}
                      >
                        <span className="font-semibold text-[#1c1c1e]">{item.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="mt-1 text-xs text-[#6e6e6e]">
                US cities via Google Places — pick a suggestion so we can save a consistent label.
              </p>
              {!locationIsValidated && location.trim().length > 0 ? (
                <p className="mt-1 text-xs font-medium text-amber-800">
                  Select a city from the list, or clear the field.
                </p>
              ) : null}
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
          </div>
        </div>
      )}
    </section>
  );
}
