/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: true,
    serverComponentsExternalPackages: [
      "ws",
      "@neondatabase/serverless",
      "expo-server-sdk",
      /** Clerk pulls these in; bundling as vendor chunks can leave broken requires in dev. */
      "crypto-js",
      "swr",
    ],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "img.clerk.com" },
      { protocol: "https", hostname: "images.clerk.dev" },
      // Vercel Blob (uploads, event images, etc.) — subdomain is per store
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
