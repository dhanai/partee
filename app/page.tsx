import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { MarketingBrochure } from "@/components/marketing-brochure";
import { loadHomePageContent } from "@/lib/page-content";
import { getAppStoreConfig, buildAppStoreUrl } from "@/lib/app-store-config";

export default async function MarketingPage() {
  const { userId } = auth();
  if (userId) {
    redirect("/discover");
  }

  const [content, appStoreConfig] = await Promise.all([
    loadHomePageContent(),
    getAppStoreConfig(),
  ]);

  const appStoreUrl =
    appStoreConfig.iosAppId
      ? buildAppStoreUrl(appStoreConfig.iosAppId)
      : process.env.NEXT_PUBLIC_IOS_APP_STORE_URL?.trim() || null;

  return <MarketingBrochure appStoreUrl={appStoreUrl} content={content} />;
}
