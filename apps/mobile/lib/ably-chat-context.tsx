import { useAuth } from "@clerk/clerk-expo";
import { ChatClient, LogLevel } from "@ably/chat";
import { ChatClientProvider } from "@ably/chat/react";
import * as Ably from "ably";
import { AblyProvider } from "ably/react";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { apiBaseUrl } from "./api";
import { notifyApiSessionInvalid } from "./api-session-invalid";

const MountedContext = createContext(false);

export function useAblyChatMounted(): boolean {
  return useContext(MountedContext);
}

/**
 * When the user is signed in, connects to Ably with a token from POST /api/ably/token.
 * If Ably isn’t configured (503) or the user is logged out, children still render without chat realtime.
 */
export function AblyChatProviders({ children }: { children: ReactNode }) {
  const { isLoaded, userId, getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const [realtime, setRealtime] = useState<Ably.Realtime | null>(null);

  useEffect(() => {
    if (!isLoaded || !userId) {
      setRealtime((prev) => {
        if (prev) {
          prev.close();
        }
        return null;
      });
      return;
    }

    const client = new Ably.Realtime({
      authCallback: (tokenParams, callback) => {
        void (async () => {
          try {
            const jwt = await getTokenRef.current?.();
            if (!jwt) {
              callback("No Clerk session", null);
              return;
            }
            const res = await fetch(`${apiBaseUrl}/api/ably/token`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${jwt}`,
                Accept: "application/json",
              },
            });
            if (!res.ok) {
              if (res.status === 401) {
                notifyApiSessionInvalid();
              }
              const text = await res.text();
              let errMsg = text || `Ably token ${res.status}`;
              try {
                const j = JSON.parse(text) as { error?: string; details?: string };
                if (typeof j.error === "string") {
                  errMsg =
                    typeof j.details === "string" ? `${j.error}\n${j.details}` : j.error;
                  if (res.status === 500 && !j.details) {
                    errMsg += "\n→ Vercel: Logs → filter “[POST /api/ably/token]” for the real error.";
                  }
                }
              } catch {
                // keep raw text
              }
              if (typeof __DEV__ !== "undefined" && __DEV__) {
                console.warn("[Parfade] /api/ably/token failed:", res.status, errMsg);
              }
              callback(errMsg, null);
              return;
            }
            const tokenRequest = (await res.json()) as import("ably").TokenRequest;
            callback(null, tokenRequest);
          } catch (e) {
            callback(e instanceof Error ? e.message : String(e), null);
          }
        })();
      },
    });

    setRealtime(client);
    return () => {
      try { client.close(); } catch { /* unmount tear-down */ }
    };
  }, [isLoaded, userId]);

  const chatClient = useMemo(() => {
    if (!realtime) return null;
    return new ChatClient(realtime, { logLevel: LogLevel.Error });
  }, [realtime]);

  if (!realtime || !chatClient) {
    return <MountedContext.Provider value={false}>{children}</MountedContext.Provider>;
  }

  return (
    <MountedContext.Provider value={true}>
      <AblyProvider client={realtime}>
        <ChatClientProvider client={chatClient}>{children}</ChatClientProvider>
      </AblyProvider>
    </MountedContext.Provider>
  );
}
