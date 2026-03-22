# Modular side games (Skins, Wolf, …)

This document is the checklist for adding a **new game type** without new database tables.

## 1. Database enum

Add a value to the Postgres enum `game_type` and to `gameTypeEnum` in [`db/schema.ts`](../db/schema.ts), then generate/run a migration (`ALTER TYPE ... ADD VALUE`).

## 2. Payload validation (server)

In [`lib/games/payload-schemas.ts`](../lib/games/payload-schemas.ts):

- Define a **Zod** schema for the per-hole JSON.
- Enforce that any user id in the payload is in the session’s player list (`assertSubset`).
- Extend `parseHolePayload()` with a branch for your `game_type`.

## 3. API behavior

Hole writes go through [`app/api/games/[id]/holes/[holeNumber]/route.ts`](../app/api/games/[id]/holes/[holeNumber]/route.ts) — no changes needed if `parseHolePayload` handles the type.

Session creation is [`POST /api/games`](../app/api/games/route.ts). **Guest (write-in) golfers** are stored only in `game_sessions.settings.guestPlayers` as `{ id: uuid, name }` (see [`lib/games/guest-players.ts`](../lib/games/guest-players.ts)); hole payloads reference those ids like real `users.id`. No `game_session_players` row for guests.

**Session updates:** [`PATCH /api/games/[id]`](../app/api/games/[id]/route.ts) accepts `status` (existing), **`holesCount`** (9 or 18, Skins/Wolf only; cannot shrink below any hole that already has events), and **`settings`** partials: Wolf `wolfTeeOff` / `wolfTieHandling`, Skins `skinsTieHandling`. Participants may update; `guestPlayers` / `wolfLetterOrder` are not accepted here.

## 4. Mobile registry and UI

- Add the game to [`apps/mobile/lib/games-registry.ts`](../apps/mobile/lib/games-registry.ts) (`implemented: true`, **`minPlayers`**, optional **`maxPlayers`**) + mirror caps in [`POST /api/games`](../app/api/games/route.ts) `minPlayersForGame` / `maxPlayersForGame` (Wolf = 4–4).
- Add a hole editor component under `apps/mobile/components/games/`.
- Wire it in [`apps/mobile/app/games/session/[sessionId].tsx`](../apps/mobile/app/games/session/[sessionId].tsx) next to the existing `skins` / `wolf` branches.

### Wolf session `settings` (server-assigned + host picks)

On **`POST /api/games`** with `game_type: wolf`, the server stores:

- `wolfLetterOrder: string[]` — random permutation of all roster user ids (Parfade + guest ids). Letters **A–H** map to indices 0–7 for display.
- `wolfTeeOff: "first" | "last"` — from request `settings` (default `"first"`).
- `wolfTieHandling: "carry" | "wash"` — from request `settings` (default `"carry"`).

Hole **`PUT`** validates `payload.wolfUserId` against [`lib/games/wolf-rotation.ts`](../lib/games/wolf-rotation.ts) (skipped if `wolfLetterOrder` is missing — legacy sessions).

Wolf hole **`payload`** (normalized on write):

- **`winnerUserIds`**: every player who had the **best (lowest) stroke count** on the hole (all who tied that number). At least one id when using the modern payload. **`outcome`** is derived via [`lib/games/wolf-outcome.ts`](../lib/games/wolf-outcome.ts): all lows on **Team Wolf** → `wolf_won`; all on **Team Pack** → `pack_won`; lows **span both** teams → **`tie`** = **no wolf points** that hole; carry/wash still applies to the **next** hole’s stake multiplier. Older rows may omit `winnerUserIds` and only store **`outcome`**.

**Wolf points (mobile totals in [`apps/mobile/lib/wolf-scoring.ts`](../apps/mobile/lib/wolf-scoring.ts)):** after a hole with `outcome === "tie"`, `wolfTieHandling === "carry"` multiplies the stake chain for subsequent holes; **`wash`** resets so that tie does not increase the multiplier. All point amounts below scale by the active stake for that hole.

**Terms (UI):** **Team Wolf** = the wolf plus their partner when they pick one (otherwise just the wolf). **Team Pack** = everyone else: the **three** other players if the wolf went **lone**, or the **two** unpicked players in 2v2.

| Situation | Team Wolf wins (`wolf_won`) | Team Pack wins (`pack_won`) |
|-----------|----------------------------|----------------------------|
| **Lone wolf** (3 vs 1) | Wolf **+3×stake** | Each of the **three** Team Pack players **+1×stake** (3 vs 3 total) |
| **Wolf + partner** (2 vs 2) | Wolf **+1×stake**, partner **+1×stake** | Each of the **two** Team Pack players **+1×stake** (2 vs 2 total) |
| **No wolf points** (`tie`: low gross split across both teams) | — | **0** that hole; next-hole stake follows **carry** or **wash** |

### Skins session `settings`

On **`POST /api/games`** with `game_type: skins`, the server stores **`skinsTieHandling: "carry" | "wash"`** (default **`carry`**). **`holesCount`** must be **9** or **18** for Skins and Wolf.

### Skins hole payload

Mobile matches Wolf-style **who shot lowest** picks: **`won`** = exactly one `winnerUserIds` (sole low gross wins the skin); **`tie`** = two or more ids (tied low). Legacy **`carry`** is normalized to **`tie`**. Older rows may have **`tie`** with empty `winnerUserIds` (undifferentiated carry).

**Skin totals** (standings): [`apps/mobile/lib/skins-scoring.ts`](../apps/mobile/lib/skins-scoring.ts) **`computeSkinsTotals`**: walks holes **1..holesCount** in order. **`carry`** — each tied hole increments a carry counter; the next **`won`** awards **1 + carry** skins to the winner then resets carry. **`wash`** — a tied hole resets carry to **0** (no accumulation across that tie).

### Wolf recap copy (names, not “teams”)

Round and session recaps use [`lib/games/wolf-recap-name-stats.ts`](../lib/games/wolf-recap-name-stats.ts): **wolf+partner** pair wins, **opposing side** wins (who beat the wolf), and **lone wolf** W/L/splits per player — all with **first names**, not “Team Wolf / Team Pack.”

## 5. Stats / leaderboards (later)

Query `game_hole_events.payload` (and `game_type`) to aggregate wins, carries, wolf points, etc. Optional: materialized columns or a rollup table fed from the same PUT handler.
