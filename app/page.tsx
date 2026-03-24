import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { MarketingBrochure } from "@/components/marketing-brochure";
import { loadHomePageContent } from "@/lib/page-content";

export default async function MarketingPage() {
  const { userId } = auth();
  if (userId) {
    redirect("/discover");
  }

  const appStoreUrl = process.env.NEXT_PUBLIC_IOS_APP_STORE_URL?.trim() || null;
  const content = await loadHomePageContent();

  return <MarketingBrochure appStoreUrl={appStoreUrl} content={content} />;
}
