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

Session creation is [`POST /api/games`](../app/api/games/route.ts) — no change unless the new game needs **session-level** `settings` fields (still use JSON `settings` on `game_sessions`).

## 4. Mobile registry and UI

- Add the game to [`apps/mobile/lib/games-registry.ts`](../apps/mobile/lib/games-registry.ts) (`implemented: true` when ready).
- Add a hole editor component under `apps/mobile/components/games/`.
- Wire it in [`apps/mobile/app/(tabs)/games/session/[sessionId].tsx`](../apps/mobile/app/(tabs)/games/session/[sessionId].tsx) next to the existing `skins` / `wolf` branches.

## 5. Stats / leaderboards (later)

Query `game_hole_events.payload` (and `game_type`) to aggregate wins, carries, wolf points, etc. Optional: materialized columns or a rollup table fed from the same PUT handler.
