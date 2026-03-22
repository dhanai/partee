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

- **`winnerUserIds`**: who had the low score or tied for low (stats). Empty = halved hole. When present, **`outcome`** is derived via [`lib/games/wolf-outcome.ts`](../lib/games/wolf-outcome.ts) (wolf team vs pack vs tie for points). Older rows may omit `winnerUserIds` and only store **`outcome`**.

## 5. Stats / leaderboards (later)

Query `game_hole_events.payload` (and `game_type`) to aggregate wins, carries, wolf points, etc. Optional: materialized columns or a rollup table fed from the same PUT handler.
