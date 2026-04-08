/**
 * Max invitee UUIDs per request for POST /api/rounds and POST /api/rounds/:token/invites.
 * Intentionally unrelated to `totalSpots` / "looking for" — hosts may over-invite; first to
 * claim fill the round (see join route confirmed-cap).
 *
 * Mirrored in `apps/mobile/lib/round-invite-limits.ts` for Expo imports.
 */
export const ROUND_INVITE_USER_IDS_MAX_PER_REQUEST = 500;
