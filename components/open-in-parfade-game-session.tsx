"use client";

import { useEffect, useState } from "react";

const ANDROID_PKG = "com.parfade.parfademobile";
const APP_SCHEME = "parfade";

/**
 * Deep link into Expo `app/games/session/[sessionId].tsx` (same path shape as the web route).
 */
export function OpenInParfadeGameSessionBar({
  sessionId,
  browserUrl,
}: {
  sessionId: string;
  browserUrl: string;
}) {
  const path = `games/session/${sessionId}`;
  const [openHref, setOpenHref] = useState(() => `${APP_SCHEME}://${path}`);

  useEffect(() => {
    const schemePath = `${APP_SCHEME}://${path}`;
    if (typeof navigator === "undefined" || !browserUrl) {
      setOpenHref(schemePath);
      return;
    }
    if (/Android/i.test(navigator.userAgent)) {
      const fallback = encodeURIComponent(browserUrl);
      setOpenHref(
        `intent://${path}#Intent;scheme=${APP_SCHEME};package=${ANDROID_PKG};S.browser_fallback_url=${fallback};end`,
      );
    } else {
      setOpenHref(schemePath);
    }
  }, [path, browserUrl]);

  const appStoreUrl = process.env.NEXT_PUBLIC_IOS_APP_STORE_URL?.trim();

  return (
    <div className="rounded-2xl border border-[#ece8e1] bg-[#faf8f5] p-4 shadow-sm">
      <p className="text-sm font-semibold text-[#1a3c2a]">Score in the Parfade app</p>
      <p className="mt-1 text-sm leading-snug text-[#6e6e6e]">
        Hole entry, standings, and finish flow run in the mobile app — same account as the web.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <a
          href={openHref}
          className="inline-flex items-center justify-center rounded-2xl bg-[#1a3c2a] px-5 py-3 text-center text-sm font-bold tracking-tight text-[#f4f1ea] shadow-[0_4px_12px_rgba(26,60,42,0.25)] transition hover:bg-[#2d6341] active:scale-[0.99]"
        >
          Open in app
        </a>
        {appStoreUrl ? (
          <a
            href={appStoreUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-2xl border border-[#ece8e1] bg-white px-5 py-3 text-center text-sm font-semibold text-[#1a3c2a] transition hover:bg-[#f2ede6]"
          >
            Get Parfade
          </a>
        ) : null}
      </div>
    </div>
  );
}
