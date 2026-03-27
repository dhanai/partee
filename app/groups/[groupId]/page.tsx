import { notFound } from "next/navigation";
import { count, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Image from "next/image";
import { db } from "@/db";
import { groupMembers, groups } from "@/db/schema";
import { getAppStoreConfig, buildAppStoreUrl } from "@/lib/app-store-config";
import { GroupOpenInApp } from "./group-open-in-app";

type Props = { params: { groupId: string } };

async function fetchGroup(groupId: string) {
  const [group] = await db
    .select({
      id: groups.id,
      name: groups.name,
      description: groups.description,
      imageUrl: groups.imageUrl,
      heroImageUrl: groups.heroImageUrl,
      joinPolicy: groups.joinPolicy,
    })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);

  if (!group) return null;

  const [{ total }] = await db
    .select({ total: count() })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, groupId));

  return { ...group, memberCount: Number(total) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const group = await fetchGroup(params.groupId);
  if (!group) return { title: "Group not found" };

  const title = `${group.name} — Parfade`;
  const description =
    group.description?.slice(0, 160) ||
    `Join ${group.name} on Parfade — ${group.memberCount} member${group.memberCount !== 1 ? "s" : ""}.`;

  return {
    title,
    description,
    openGraph: {
      title: group.name,
      description,
      ...(group.heroImageUrl || group.imageUrl
        ? { images: [group.heroImageUrl || group.imageUrl!] }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: group.name,
      description,
      ...(group.heroImageUrl || group.imageUrl
        ? { images: [group.heroImageUrl || group.imageUrl!] }
        : {}),
    },
  };
}

function policyLabel(policy: string) {
  if (policy === "public") return "Public group";
  if (policy === "approval") return "Private group";
  return "Invite only";
}

export default async function GroupSharePage({ params }: Props) {
  const group = await fetchGroup(params.groupId);
  if (!group) notFound();

  const appStoreConfig = await getAppStoreConfig();
  const appStoreUrl = appStoreConfig.iosAppId
    ? buildAppStoreUrl(appStoreConfig.iosAppId)
    : process.env.NEXT_PUBLIC_IOS_APP_STORE_URL?.trim() || null;

  return (
    <div className="flex min-h-screen flex-col items-center bg-[#faf8f5] px-4 py-12 sm:py-20">
      <div className="w-full max-w-md space-y-6">
        {/* Hero */}
        {group.heroImageUrl ? (
          <div className="relative h-[200px] w-full overflow-hidden rounded-2xl bg-[#ece8e1]">
            <Image
              src={group.heroImageUrl}
              alt=""
              fill
              className="object-cover"
              sizes="(max-width: 448px) 100vw, 448px"
              priority
            />
          </div>
        ) : null}

        {/* Avatar + Info */}
        <div className="flex flex-col items-center text-center">
          {group.imageUrl ? (
            <div className="relative h-20 w-20 overflow-hidden rounded-full border-[3px] border-white bg-[#ece8e1] shadow-md">
              <Image
                src={group.imageUrl}
                alt={group.name}
                fill
                className="object-cover"
                sizes="80px"
              />
            </div>
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full border-[3px] border-white bg-[#1a3c2a] text-3xl font-bold text-[#f4f1ea] shadow-md">
              {group.name.trim().charAt(0).toUpperCase()}
            </div>
          )}

          <h1 className="mt-4 text-2xl font-bold text-[#1c1c1e]">{group.name}</h1>

          <p className="mt-1 text-sm font-medium text-[#6e6e6e]">
            {policyLabel(group.joinPolicy)} · {group.memberCount} member
            {group.memberCount !== 1 ? "s" : ""}
          </p>

          {group.description ? (
            <p className="mt-3 text-sm leading-relaxed text-[#6e6e6e]">
              {group.description}
            </p>
          ) : null}
        </div>

        {/* Open in app */}
        <GroupOpenInApp groupId={group.id} appStoreUrl={appStoreUrl} />

        {/* Branding */}
        <p className="text-center text-xs text-[#a3a3a3]">
          Parfade — Golf plans without the group text chaos
        </p>
      </div>
    </div>
  );
}
