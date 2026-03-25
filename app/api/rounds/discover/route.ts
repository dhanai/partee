import { NextResponse } from "next/server";
import { and, asc, eq, exists, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { courses, rounds, spots, users } from "@/db/schema";
import { ensureDbUser } from "@/lib/auth";
import { resolveValidatedUsLocation } from "@/lib/places";
import { haversineMiles } from "@/lib/utils";
import { orderConfirmedPlayersHostFirstByClaimOrder } from "@/lib/confirmed-players-order";
import { resolveRoundImageUrl } from "@/lib/round-images";

const planningLocationCoordCache = new Map<
  string,
  { lat: number; lng: number; expiresAt: number }
>();
const PLANNING_CACHE_TTL_MS = 1000 * 60 * 60 * 24;

async function getPlanningLocationCoords(location: string) {
  const cacheKey = location.trim().toLowerCase();
  const now = Date.now();
  const cached = planningLocationCoordCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return { lat: cached.lat, lng: cached.lng };
  }
  const resolved = await resolveValidatedUsLocation(location);
  if (!resolved || resolved.lat === null || resolved.lng === null) return null;
  planningLocationCoordCache.set(cacheKey, {
    lat: resolved.lat,
    lng: resolved.lng,
    expiresAt: now + PLANNING_CACHE_TTL_MS,
  });
  return { lat: resolved.lat, lng: resolved.lng };
}

export async function GET(req: Request) {
  const currentUser = await ensureDbUser(req);
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const parsedDistance = Number(searchParams.get("distanceMiles") ?? "25");
  const distanceMiles =
    Number.isFinite(parsedDistance) && parsedDistance > 0 ? parsedDistance : 25;
  const hasCoords = Boolean(lat && lng);
  const parsedLimit = Number(searchParams.get("limit") ?? "25");
  const parsedCursor = Number(searchParams.get("cursor") ?? "0");
  const limit = Number.isFinite(parsedLimit)
    ? Math.max(1, Math.min(100, Math.trunc(parsedLimit)))
    : 25;
  const cursor = Number.isFinite(parsedCursor) ? Math.max(0, Math.trunc(parsedCursor)) : 0;

  const now = new Date();
  const dayStart = date ? new Date(`${date}T00:00:00.000Z`) : null;
  const dayEnd = date ? new Date(`${date}T23:59:59.999Z`) : null;

  const rows = await db
    .select({
      id: rounds.id,
      inviteToken: rounds.inviteToken,
      mode: rounds.mode,
      preferredTimeWindow: rounds.preferredTimeWindow,
      planningLocation: rounds.planningLocation,
      courseName: rounds.courseName,
      customImageUrl: rounds.customImageUrl,
      courseMetadata: courses.metadata,
      teeTime: rounds.teeTime,
      targetDate: rounds.targetDate,
      totalSpots: rounds.totalSpots,
      joinPolicy: rounds.joinPolicy,
      hostId: users.id,
      hostName: users.name,
      hostAvatar: users.avatar,
      lat: courses.lat,
      lng: courses.lng,
      confirmedCount:
        sql<number>`coalesce(sum(case when ${spots.status} = 'confirmed' then 1 else 0 end), 0)`.mapWith(
          Number,
        ),
    })
    .from(rounds)
    .innerJoin(users, eq(users.id, rounds.hostId))
    .leftJoin(courses, eq(courses.id, rounds.courseId))
    .leftJoin(spots, eq(spots.roundId, rounds.id))
    .where(
      and(
        isNull(rounds.groupId),
        currentUser
          ? or(
              eq(rounds.visibility, "public"),
              eq(rounds.hostId, currentUser.id),
              exists(
                db
                  .select()
                  .from(spots)
                  .where(
                    and(
                      eq(spots.roundId, rounds.id),
                      eq(spots.userId, currentUser.id),
                      inArray(spots.status, ["invited", "confirmed", "requested"]),
                    ),
                  ),
              ),
            )
          : eq(rounds.visibility, "public"),
      ),
    )
    .groupBy(
      rounds.id,
      users.id,
      users.name,
      users.avatar,
      courses.lat,
      courses.lng,
      courses.metadata,
    )
    .orderBy(asc(rounds.targetDate));

  /** Viewer-only: hide rounds you host from *your* Discover feed (others still see per public / invite-only). */
  const rowsVisible = rows.filter((row) => {
    if (!currentUser?.hideHostedRoundsFromDiscover) return true;
    return row.hostId !== currentUser.id;
  });

  const withRemaining = (
    await Promise.all(
      rowsVisible.map(async (row) => {
      const effectiveDate = row.teeTime ?? row.targetDate;
      let rowLat = row.lat ? Number(row.lat) : null;
      let rowLng = row.lng ? Number(row.lng) : null;
      if ((rowLat === null || rowLng === null) && row.planningLocation) {
        const planningCoords = await getPlanningLocationCoords(row.planningLocation);
        rowLat = planningCoords?.lat ?? null;
        rowLng = planningCoords?.lng ?? null;
      }
      const distance =
        lat && lng && rowLat !== null && rowLng !== null
          ? haversineMiles(Number(lat), Number(lng), rowLat, rowLng)
          : null;
      const imageUrl = resolveRoundImageUrl({
        customImageUrl: row.customImageUrl,
        courseMetadata: row.courseMetadata,
      });
      return {
        id: row.id,
        inviteToken: row.inviteToken,
        mode: row.mode,
        preferredTimeWindow: row.preferredTimeWindow,
        planningLocation: row.planningLocation,
        courseName: row.courseName ?? "Course TBD",
        teeTime: row.teeTime,
        targetDate: row.targetDate,
        effectiveDate,
        totalSpots: row.totalSpots,
        joinPolicy: row.joinPolicy,
        hostId: row.hostId,
        hostName: row.hostName,
        hostAvatar: row.hostAvatar,
        lat: rowLat,
        lng: rowLng,
        distanceMiles: distance,
        spotsRemaining: Math.max(0, row.totalSpots - row.confirmedCount),
        imageUrl,
      };
      }),
    )
  )
    .filter((row) => {
      const when = new Date(row.effectiveDate);
      if (dayStart && dayEnd) {
        return when >= dayStart && when <= dayEnd;
      }
      return when >= now;
    })
    .filter((row) => row.spotsRemaining > 0)
    .filter((row) => {
      if (!hasCoords) return true;
      return row.distanceMiles !== null && row.distanceMiles <= distanceMiles;
    })
    .sort((a, b) => {
      const byDate =
        new Date(a.effectiveDate).getTime() - new Date(b.effectiveDate).getTime();
      if (byDate !== 0) return byDate;
      if (hasCoords) {
        const aDistance = a.distanceMiles ?? Number.POSITIVE_INFINITY;
        const bDistance = b.distanceMiles ?? Number.POSITIVE_INFINITY;
        if (aDistance !== bDistance) return aDistance - bDistance;
      }
      return 0;
    });

  const page = withRemaining.slice(cursor, cursor + limit);
  const nextCursor = cursor + limit < withRemaining.length ? String(cursor + limit) : null;

  const pageIds = page.map((r) => r.id);
  const confirmedByRound = new Map<
    string,
    Array<{ id: string; name: string; avatar: string | null; claimedAt: Date }>
  >();

  if (pageIds.length > 0) {
    const confirmedRows = await db
      .select({
        roundId: spots.roundId,
        userId: users.id,
        name: users.name,
        avatar: users.avatar,
        claimedAt: spots.createdAt,
      })
      .from(spots)
      .innerJoin(users, eq(users.id, spots.userId))
      .where(and(inArray(spots.roundId, pageIds), eq(spots.status, "confirmed")))
      .orderBy(asc(spots.roundId), asc(spots.createdAt));

    for (const row of confirmedRows) {
      const list = confirmedByRound.get(row.roundId) ?? [];
      list.push({
        id: row.userId,
        name: row.name,
        avatar: row.avatar,
        claimedAt: row.claimedAt,
      });
      confirmedByRound.set(row.roundId, list);
    }
  }

  const roundsOut = page.map((r) => ({
    ...r,
    confirmedPlayers: orderConfirmedPlayersHostFirstByClaimOrder(
      confirmedByRound.get(r.id) ?? [],
      r.hostId,
    ),
  }));

  return NextResponse.json({ rounds: roundsOut, nextCursor, hasMore: nextCursor !== null });
}
