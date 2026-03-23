"use client";

import { useEffect, useState } from "react";

const ANDROID_PKG = "com.parfade.parfademobile";
const APP_SCHEME = "parfade";

/**
 * Deep link into Expo Router `app/round/[token].tsx`.
 * iOS: custom scheme; Android Chrome: intent URL with fallback to this page if the app isn’t installed.
 * Universal Links (https://your-domain/round/…) work once AASA + iOS associated domains are deployed
 * and the user has rebuilt the native app.
 */
export function OpenInParfadeAppBar({
  inviteToken,
  browserUrl,
}: {
  inviteToken: string;
  /** Current round page URL (https) for Android intent fallback. */
  browserUrl: string;
}) {
  const [openHref, setOpenHref] = useState(
    () => `${APP_SCHEME}://round/${inviteToken}`,
  );

  useEffect(() => {
    const schemePath = `${APP_SCHEME}://round/${inviteToken}`;
    if (typeof navigator === "undefined" || !browserUrl) {
      setOpenHref(schemePath);
      return;
    }
    if (/Android/i.test(navigator.userAgent)) {
      const fallback = encodeURIComponent(browserUrl);
      setOpenHref(
        `intent://round/${inviteToken}#Intent;scheme=${APP_SCHEME};package=${ANDROID_PKG};S.browser_fallback_url=${fallback};end`,
      );
    } else {
      setOpenHref(schemePath);
    }
  }, [inviteToken, browserUrl]);

  const appStoreUrl = process.env.NEXT_PUBLIC_IOS_APP_STORE_URL?.trim();

  return (
    <div className="rounded-2xl border border-[#ece8e1] bg-[#faf8f5] p-4 shadow-sm">
      <p className="text-sm font-semibold text-[#1a3c2a]">Have the Parfade app?</p>
      <p className="mt-1 text-sm leading-snug text-[#6e6e6e]">
        Open this invite in the app — same account, full experience.
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
