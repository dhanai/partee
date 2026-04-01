# Profile Activity Scale Ownership

## Scope
- User profile activity feed combines two domains:
  - Profile posts
  - Open rounds (hosting + joined)

## Ownership
- Posts domain query path:
  - `app/api/posts/route.ts`
- Unified profile activity API:
  - `app/api/users/[userId]/activity/route.ts`
- Open rounds domain query path:
  - `app/api/users/[userId]/open-rounds/route.ts`
  - `lib/user-profile-open-rounds.ts`
- Mobile consumers:
  - `apps/mobile/app/(tabs)/profile.tsx`
  - `apps/mobile/app/profile/[userId]/index.tsx`

## SLO Targets
- `GET /api/posts` (profile wall path) p95: <= 180ms
- `GET /api/users/[userId]/open-rounds` p95: <= 220ms
- `GET /api/users/[userId]/activity` p95: <= 250ms
- `GET /api/groups/[groupId]/activity` p95: <= 220ms

## Baseline & Regression Workflow
1. Run baseline query-plan script:
   - `npm run db:profile-activity-baseline -- <profileUserId> <viewerUserId> <groupId>`
2. Compare plans before/after index migrations:
   - `db/migrations/0041_profile_activity_scale_indexes.sql`
   - `db/migrations/0042_profile_activity_cleanup_indexes.sql`
3. Enable perf logs in API host:
   - `PROFILE_ACTIVITY_PERF=1`
4. Watch `[perf]` logs for endpoint duration and row count metadata.

## Notes
- `EXPO_PUBLIC_PROFILE_ACTIVITY_UNIFIED` controls mobile read-path migration:
  - `"1"` (default): use unified profile activity endpoint.
  - `"0"`: fall back to legacy dual-fetch path.
