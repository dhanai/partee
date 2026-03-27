"use client";

import { useEffect, useState } from "react";

const ANDROID_PKG = "com.parfade.parfademobile";
const APP_SCHEME = "parfade";

export function GroupOpenInApp({
  groupId,
  appStoreUrl,
}: {
  groupId: string;
  appStoreUrl: string | null;
}) {
  const [openHref, setOpenHref] = useState(
    () => `${APP_SCHEME}://group/${groupId}`,
  );

  useEffect(() => {
    const schemePath = `${APP_SCHEME}://group/${groupId}`;
    if (typeof navigator === "undefined") {
      setOpenHref(schemePath);
      return;
    }
    if (/Android/i.test(navigator.userAgent)) {
      const fallback = encodeURIComponent(window.location.href);
      setOpenHref(
        `intent://group/${groupId}#Intent;scheme=${APP_SCHEME};package=${ANDROID_PKG};S.browser_fallback_url=${fallback};end`,
      );
    } else {
      setOpenHref(schemePath);
    }
  }, [groupId]);

  return (
    <div className="rounded-2xl border border-[#ece8e1] bg-white p-5 shadow-sm">
      <p className="text-base font-bold text-[#1a3c2a]">View in the Parfade app</p>
      <p className="mt-1 text-sm leading-snug text-[#6e6e6e]">
        Open this group in the app to see activity, join, and chat with members.
      </p>
      <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
        <a
          href={openHref}
          className="inline-flex flex-1 items-center justify-center rounded-2xl bg-[#1a3c2a] px-5 py-3 text-center text-sm font-bold tracking-tight text-[#f4f1ea] shadow-[0_4px_12px_rgba(26,60,42,0.25)] transition hover:bg-[#2d6341] active:scale-[0.99]"
        >
          Open in app
        </a>
        {appStoreUrl ? (
          <a
            href={appStoreUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex flex-1 items-center justify-center rounded-2xl border border-[#ece8e1] bg-[#faf8f5] px-5 py-3 text-center text-sm font-semibold text-[#1a3c2a] transition hover:bg-[#f2ede6]"
          >
            Get Parfade
          </a>
        ) : null}
      </div>
    </div>
  );
}
