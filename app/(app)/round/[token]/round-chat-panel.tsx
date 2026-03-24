"use client";

import { useAuth } from "@clerk/nextjs";
import Image from "next/image";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ParfadeSpinner } from "@/components/parfade-spinner";
import { isRoundChatPath } from "@/lib/is-round-chat-path";

type ChatMessage = {
  id: string;
  body: string;
  createdAt: string;
  isMine?: boolean;
  user: { id: string; name: string; avatar: string | null };
};

function messageIsMine(m: ChatMessage, viewerId: string | null): boolean {
  if (typeof m.isMine === "boolean") return m.isMine;
  return viewerId != null && m.user.id === viewerId;
}

const POLL_MS = 2800;

export function RoundChatPanel({
  inviteToken,
  variant = "inline",
}: {
  inviteToken: string;
  variant?: "inline" | "page";
}) {
  const pathname = usePathname();
  const pageChatImmersive = variant === "page" && isRoundChatPath(pathname);
  const { getToken, isLoaded } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const pollActive = variant === "page" || expanded;
  const initialPageAutoScrollPendingRef = useRef(true);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  const scrollMessagesToBottomRef = useRef<() => void>(() => {});

  const authHeaders = useCallback(async () => {
    const t = await getToken();
    if (!t) return null;
    return { Authorization: `Bearer ${t}` };
  }, [getToken]);

  const fetchInitial = useCallback(async () => {
    const headers = await authHeaders();
    if (!headers) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/rounds/${inviteToken}/messages`, { headers });
      const json = (await res.json()) as {
        messages?: ChatMessage[];
        viewerId?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Could not load chat.");
      setMessages(json.messages ?? []);
      if (json.viewerId) setViewerId(json.viewerId);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load chat.");
    } finally {
      setLoading(false);
    }
  }, [inviteToken, authHeaders]);

  useEffect(() => {
    if (!isLoaded) return;
    setLoading(true);
    void fetchInitial();
  }, [isLoaded, fetchInitial]);

  useEffect(() => {
    if (!isLoaded || !pollActive) return;
    const id = setInterval(() => {
      void (async () => {
        const headers = await authHeaders();
        if (!headers) return;
        const list = messagesRef.current;
        try {
          if (list.length === 0) {
            const res = await fetch(`/api/rounds/${inviteToken}/messages`, { headers });
            const json = (await res.json()) as { messages?: ChatMessage[]; viewerId?: string };
            if (res.ok) {
              if (json.viewerId) setViewerId(json.viewerId);
              if ((json.messages?.length ?? 0) > 0) {
                setMessages(json.messages ?? []);
                queueMicrotask(() => {
                  requestAnimationFrame(() => {
                    scrollMessagesToBottomRef.current();
                    requestAnimationFrame(() => scrollMessagesToBottomRef.current());
                  });
                });
              }
            }
            return;
          }
          const last = list[list.length - 1];
          const res = await fetch(
            `/api/rounds/${inviteToken}/messages?after=${encodeURIComponent(last.id)}`,
            { headers },
          );
          const json = (await res.json()) as { messages?: ChatMessage[]; viewerId?: string };
          if (!res.ok) return;
          if (json.viewerId) setViewerId(json.viewerId);
          const incoming = json.messages ?? [];
          if (incoming.length === 0) return;
          let scrollAfterPoll = false;
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            const merged = [...prev];
            for (const m of incoming) {
              if (!seen.has(m.id)) {
                seen.add(m.id);
                merged.push(m);
              }
            }
            scrollAfterPoll =
              merged.length > prev.length || merged.at(-1)?.id !== prev.at(-1)?.id;
            return merged;
          });
          if (scrollAfterPoll) {
            queueMicrotask(() => {
              requestAnimationFrame(() => {
                scrollMessagesToBottomRef.current();
                requestAnimationFrame(() => scrollMessagesToBottomRef.current());
              });
            });
          }
        } catch {
          /* ignore */
        }
      })();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [isLoaded, pollActive, inviteToken, authHeaders]);

  async function send() {
    const text = draft.trim();
    if (!text || sendBusy) return;
    setSendBusy(true);
    setError(null);
    try {
      const headers = await authHeaders();
      if (!headers) {
        setError("Sign in to send.");
        return;
      }
      const res = await fetch(`/api/rounds/${inviteToken}/messages`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const json = (await res.json()) as {
        message?: ChatMessage;
        viewerId?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Send failed.");
      if (json.viewerId) setViewerId(json.viewerId);
      setDraft("");
      if (json.message) {
        setMessages((prev) =>
          prev.some((m) => m.id === json.message!.id) ? prev : [...prev, json.message!],
        );
        requestAnimationFrame(() => {
          scrollMessagesToBottomRef.current();
          requestAnimationFrame(() => scrollMessagesToBottomRef.current());
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed.");
    } finally {
      setSendBusy(false);
    }
  }

  function formatTime(iso: string) {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    } catch {
      return "";
    }
  }

  const pageScrollRef = useRef<HTMLDivElement>(null);
  const pageComposerBarRef = useRef<HTMLDivElement>(null);
  const inlineListRef = useRef<HTMLUListElement>(null);
  const pageBottomSentinelRef = useRef<HTMLLIElement>(null);
  const inlineBottomSentinelRef = useRef<HTMLLIElement>(null);
  /** Measured fixed composer (incl. error strip); drives scroll area bottom padding. */
  const [pageComposerBarHeight, setPageComposerBarHeight] = useState(104);

  /** Changes when the message list tail changes (new message, replace, or length change). */
  const messagesStreamKey = `${messages.length}\u0000${messages.at(-1)?.id ?? ""}`;

  const scrollMessagesToBottom = useCallback(() => {
    if (variant === "page") {
      const el = pageScrollRef.current;
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
      return;
    }
    const el = inlineListRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
    inlineBottomSentinelRef.current?.scrollIntoView({ block: "end" });
  }, [variant]);

  scrollMessagesToBottomRef.current = scrollMessagesToBottom;

  useLayoutEffect(() => {
    if (variant !== "page" || !pollActive) return;
    const el = pageComposerBarRef.current;
    if (!el) return;
    const measure = () => {
      const h = el.getBoundingClientRect().height;
      if (h > 0) setPageComposerBarHeight(Math.round(h));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [variant, pollActive, pageChatImmersive]);

  const pageScrollBottomPad = pageComposerBarHeight + 10;

  useEffect(() => {
    if (variant !== "page") return;
    // New page open or token change: re-arm one-time initial auto-scroll.
    initialPageAutoScrollPendingRef.current = true;
  }, [variant, inviteToken]);

  useLayoutEffect(() => {
    if (!pollActive) return;
    if (variant === "page") {
      if (loading && messages.length === 0) return;
      scrollMessagesToBottom();
      return;
    }
    if (messages.length === 0) return;
    scrollMessagesToBottom();
  }, [
    variant,
    pollActive,
    expanded,
    loading,
    messages.length,
    messagesStreamKey,
    pageScrollBottomPad,
    scrollMessagesToBottom,
  ]);

  useEffect(() => {
    if (!pollActive) return;
    if (variant === "page" && loading && messages.length === 0) return;
    if (variant === "inline" && messages.length === 0) return;

    let alive = true;
    const run = () => {
      if (alive) scrollMessagesToBottom();
    };
    run();
    const timeouts = [
      window.setTimeout(run, 0),
      window.setTimeout(run, 80),
      window.setTimeout(run, 250),
    ];
    const rafOuter = requestAnimationFrame(() => {
      run();
      requestAnimationFrame(() => {
        if (alive) run();
      });
    });
    return () => {
      alive = false;
      for (const t of timeouts) window.clearTimeout(t);
      cancelAnimationFrame(rafOuter);
    };
  }, [
    variant,
    pollActive,
    expanded,
    loading,
    messages.length,
    messagesStreamKey,
    pageScrollBottomPad,
    scrollMessagesToBottom,
  ]);

  useEffect(() => {
    if (variant !== "page") return;
    if (!pollActive || loading || messages.length === 0) return;
    if (!initialPageAutoScrollPendingRef.current) return;

    let alive = true;
    const run = () => {
      if (alive) scrollMessagesToBottom();
    };
    run();
    const timeouts = [0, 140, 320, 680, 1200].map((ms) =>
      window.setTimeout(run, ms),
    );
    const release = window.setTimeout(() => {
      initialPageAutoScrollPendingRef.current = false;
    }, 1300);

    return () => {
      alive = false;
      for (const t of timeouts) window.clearTimeout(t);
      window.clearTimeout(release);
    };
  }, [variant, pollActive, loading, messages.length, pageScrollBottomPad, scrollMessagesToBottom]);

  const listClassInline =
    "mt-3 max-h-60 space-y-2 overflow-y-auto rounded-xl border border-cream-200 bg-cream-50 p-3";

  function avatarFor(m: ChatMessage, onAvatarLoaded?: () => void) {
    const initial = m.user.name.trim().charAt(0).toUpperCase() || "?";
    if (m.user.avatar) {
      return (
        <Image
          src={m.user.avatar}
          alt=""
          width={28}
          height={28}
          className="h-7 w-7 shrink-0 rounded-full object-cover"
          onLoadingComplete={onAvatarLoaded}
        />
      );
    }
    return (
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#edf4ef] text-[11px] font-bold text-[#1a3c2a]">
        {initial}
      </div>
    );
  }

  const composer = (
    <div className="flex items-end gap-2">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (variant !== "page") return;
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void send();
          }
        }}
        placeholder="Message the group…"
        rows={variant === "page" ? 1 : 2}
        maxLength={2000}
        className={
          variant === "page"
            ? "max-h-[120px] min-h-[44px] flex-1 resize-none overflow-y-auto rounded-xl border border-[#ece8e1] bg-[#f1efea] px-3 py-2.5 text-[15px] text-[#1c1c1e] outline-none ring-[#1a3c2a] placeholder:text-[#6e6e6e] focus:border-[#1a3c2a]/30 focus:ring-2"
            : "parfade-input min-h-[44px] flex-1 resize-y"
        }
        disabled={sendBusy}
      />
      <button
        type="button"
        onClick={() => void send()}
        disabled={sendBusy || !draft.trim()}
        className={
          variant === "page"
            ? "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#1a3c2a] text-white disabled:opacity-50"
            : "inline-flex min-w-[4.5rem] items-center justify-center rounded-xl bg-fairway px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        }
        aria-label="Send message"
      >
        {sendBusy ? (
          <ParfadeSpinner size="sm" variant="onPrimary" aria-label="Sending" />
        ) : variant === "page" ? (
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          "Send"
        )}
      </button>
    </div>
  );

  if (variant === "page") {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {pollActive ? (
          <>
            <div
              ref={pageScrollRef}
              className="min-h-0 min-w-0 flex-1 overflow-y-auto px-0.5 pt-1"
              style={{ paddingBottom: pageScrollBottomPad }}
            >
              {loading && messages.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-[#6e6e6e]">
                  <ParfadeSpinner size="sm" variant="muted" />
                  <span>Loading messages…</span>
                </div>
              ) : error && messages.length === 0 ? (
                <p className="py-6 text-center text-sm text-red-600">{error}</p>
              ) : messages.length === 0 ? (
                <p className="py-10 text-center text-[13px] text-[#6e6e6e]">No messages yet. Say hi!</p>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {messages.map((m) => {
                    const mine = messageIsMine(m, viewerId);
                    return (
                      <li key={m.id} className="flex w-full items-end gap-2">
                        {!mine ? (
                          <>
                            {avatarFor(m, scrollMessagesToBottom)}
                            <div className="max-w-[78%] shrink rounded-[14px] border border-[#ece8e1] bg-[#f1efea] px-2.5 py-2">
                              <p className="text-[11px] font-bold text-[#6e6e6e]">{m.user.name}</p>
                              <p className="whitespace-pre-wrap text-[15px] text-[#1c1c1e]">{m.body}</p>
                              <p className="mt-1 text-right text-[10px] text-[#6e6e6e]">
                                {formatTime(m.createdAt)}
                              </p>
                            </div>
                            <div className="min-w-0 flex-1" aria-hidden />
                          </>
                        ) : (
                          <>
                            <div className="min-w-0 flex-1" aria-hidden />
                            <div className="max-w-[78%] shrink rounded-[14px] bg-[#1a3c2a] px-2.5 py-2">
                              <p className="whitespace-pre-wrap text-[15px] text-white">{m.body}</p>
                              <p className="mt-1 text-right text-[10px] text-white/85">
                                {formatTime(m.createdAt)}
                              </p>
                            </div>
                            {avatarFor(m, scrollMessagesToBottom)}
                          </>
                        )}
                      </li>
                    );
                  })}
                  <li
                    ref={pageBottomSentinelRef}
                    className="h-0 w-full shrink-0 list-none p-0"
                    aria-hidden
                  />
                </ul>
              )}
            </div>

            <div
              ref={pageComposerBarRef}
              className="fixed left-0 right-0 z-[35] bg-[#faf8f5]/95 shadow-[0_-8px_32px_-8px_rgba(0,0,0,0.1)] backdrop-blur-md supports-[backdrop-filter]:bg-[#faf8f5]/85"
              style={
                pageChatImmersive
                  ? { bottom: 0 }
                  : {
                      bottom:
                        "var(--app-tab-bar-stack, calc(4.125rem + max(0.75rem, env(safe-area-inset-bottom, 0px))))",
                    }
              }
            >
              {error && messages.length > 0 ? (
                <p className="px-5 pb-2 pt-2 text-center text-xs text-red-600 sm:px-6">
                  {error}
                </p>
              ) : null}
              <div className="border-t border-[#ece8e1] px-5 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pt-3 sm:px-6">
                <div className="mx-auto w-full max-w-lg sm:max-w-2xl lg:max-w-3xl xl:max-w-4xl">
                  {composer}
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className="parfade-card">
      <>
        <button
          type="button"
          className="flex w-full items-center justify-between text-left"
          onClick={() => setExpanded((e) => !e)}
        >
          <p className="parfade-label mb-0">Group chat</p>
          <span className="text-fairway">{expanded ? "▲" : "▼"}</span>
        </button>
        <p className="mt-1 text-xs text-charcoal-300">Host and confirmed players only.</p>
      </>

      {pollActive ? (
        <>
          {loading ? (
            <div className="mt-3 flex items-center gap-2 text-sm text-charcoal-300">
              <ParfadeSpinner size="sm" variant="muted" />
              <span>Loading messages…</span>
            </div>
          ) : error && messages.length === 0 ? (
            <p className="mt-3 text-sm text-red-600">{error}</p>
          ) : (
            <ul ref={inlineListRef} className={listClassInline}>
              {messages.length === 0 ? (
                <li className="text-center text-sm text-charcoal-300">No messages yet.</li>
              ) : (
                messages.map((m) => {
                  const mine = messageIsMine(m, viewerId);
                  return (
                    <li
                      key={m.id}
                      className={`flex w-full gap-2 text-sm ${mine ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[78%] rounded-2xl px-3 py-2 ${
                          mine
                            ? "bg-fairway text-white"
                            : "border border-cream-200 bg-white text-charcoal"
                        }`}
                      >
                        {!mine ? (
                          <>
                            <span className="font-semibold text-charcoal-500">{m.user.name}</span>
                            <span className="text-charcoal-300"> · {formatTime(m.createdAt)}</span>
                          </>
                        ) : null}
                        <p className={`mt-0.5 whitespace-pre-wrap ${mine ? "text-white" : ""}`}>
                          {m.body}
                        </p>
                        {mine ? (
                          <p className="mt-1 text-right text-[10px] text-white/75">
                            {formatTime(m.createdAt)}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  );
                })
              )}
              <li
                ref={inlineBottomSentinelRef}
                className="h-px w-full shrink-0 list-none overflow-hidden p-0"
                aria-hidden
              />
            </ul>
          )}

          {error && messages.length > 0 ? (
            <p className="mt-2 text-xs text-red-600">{error}</p>
          ) : null}

          <div className="mt-3">{composer}</div>
        </>
      ) : null}
    </div>
  );
}
