import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { loadSiteMetaForApi } from "@/lib/site-meta";

function metadataBaseFromEnv(): URL | undefined {
  const direct = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (direct) {
    try {
      return new URL(direct);
    } catch {
      // ignore invalid URL and try fallback
    }
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    try {
      return new URL(`https://${vercel}`);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export async function generateMetadata(): Promise<Metadata> {
  const fallbackTitle = "Parfade — Golf plans without the group text chaos";
  const fallbackDescription =
    "Organize rounds, find players, and run side games. Download Parfade for iOS or get started on the web.";
  const base = metadataBaseFromEnv();
  try {
    const siteMeta = await loadSiteMetaForApi();
    const ogImage = siteMeta.ogImageUrl ? [siteMeta.ogImageUrl] : undefined;
    const twitterImage = siteMeta.twitterImageUrl ? [siteMeta.twitterImageUrl] : ogImage;
    return {
      metadataBase: base,
      title: siteMeta.title,
      description: siteMeta.description,
      openGraph: {
        title: siteMeta.ogTitle,
        description: siteMeta.ogDescription,
        images: ogImage,
      },
      twitter: {
        card: "summary_large_image",
        title: siteMeta.twitterTitle,
        description: siteMeta.twitterDescription,
        images: twitterImage,
      },
    };
  } catch {
    return {
      metadataBase: base,
      title: fallbackTitle,
      description: fallbackDescription,
    };
  }
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#1a3c2a",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/discover"
      signUpFallbackRedirectUrl="/discover"
    >
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
