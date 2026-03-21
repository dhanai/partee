"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useRef, useState } from "react";

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

export function RoundChatPanel({ inviteToken }: { inviteToken: string }) {
  const { getToken, isLoaded } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

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
    if (!isLoaded || !expanded) return;
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
              if ((json.messages?.length ?? 0) > 0) setMessages(json.messages ?? []);
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
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            const merged = [...prev];
            for (const m of incoming) {
              if (!seen.has(m.id)) {
                seen.add(m.id);
                merged.push(m);
              }
            }
            return merged;
          });
        } catch {
          /* ignore */
        }
      })();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [isLoaded, expanded, inviteToken, authHeaders]);

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

  return (
    <div className="partee-card">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left"
        onClick={() => setExpanded((e) => !e)}
      >
        <p className="partee-label mb-0">Group chat</p>
        <span className="text-fairway">{expanded ? "▲" : "▼"}</span>
      </button>
      <p className="mt-1 text-xs text-charcoal-300">Host and confirmed players only.</p>

      {expanded ? (
        <>
          {loading ? (
            <p className="mt-3 text-sm text-charcoal-300">Loading messages…</p>
          ) : error && messages.length === 0 ? (
            <p className="mt-3 text-sm text-red-600">{error}</p>
          ) : (
            <ul className="mt-3 max-h-60 space-y-2 overflow-y-auto rounded-xl border border-cream-200 bg-cream-50 p-3">
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
            </ul>
          )}

          {error && messages.length > 0 ? (
            <p className="mt-2 text-xs text-red-600">{error}</p>
          ) : null}

          <div className="mt-3 flex gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Message the group…"
              rows={2}
              maxLength={2000}
              className="partee-input min-h-[44px] flex-1 resize-y"
              disabled={sendBusy}
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={sendBusy || !draft.trim()}
              className="rounded-xl bg-fairway px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {sendBusy ? "…" : "Send"}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
