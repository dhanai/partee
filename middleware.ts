import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/create(.*)",
  "/discover(.*)",
]);

function withCors(req: Request, res: NextResponse) {
  const origin = req.headers.get("origin");
  if (!origin) return res;

  const isDev = process.env.NODE_ENV !== "production";
  const isApiRoute = new URL(req.url).pathname.startsWith("/api/");
  if (!isApiRoute) return res;

  // Expo web runs on a different dev origin (e.g. localhost:8081),
  // so allow cross-origin API calls during development.
  if (isDev) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Vary", "Origin");
    res.headers.set("Access-Control-Allow-Credentials", "true");
    res.headers.set(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    );
    res.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With",
    );
  }

  return res;
}

export default clerkMiddleware((auth, req) => {
  if (req.method === "OPTIONS") {
    return withCors(req, new NextResponse(null, { status: 204 }));
  }

  if (isProtectedRoute(req)) {
    auth().protect();
  }

  return withCors(req, NextResponse.next());
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpg|jpeg|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
