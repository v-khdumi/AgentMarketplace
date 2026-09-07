import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";
import { isLoopbackRequest } from "./lib/local-access";
import { isPublicDemoMode } from "./lib/runtime-mode";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname === "/api/jobs/notifications") return NextResponse.next();
  if (isPublicDemoMode()) return NextResponse.next();
  if (pathname === "/login" || pathname === "/api/health" || pathname === "/api/marketplace/bootstrap" || pathname === "/api/marketplace/branding/logo" || pathname.startsWith("/api/auth/") || pathname === "/resources") return NextResponse.next();
  if (process.env.NODE_ENV !== "production" && process.env.DEMO_MODE === "true" && isLoopbackRequest(request.headers)) return NextResponse.next();
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (token && token.tenantId === process.env.ENTRA_TENANT_ID && !token.error) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const url = new URL("/login", request.url); url.searchParams.set("callbackUrl", pathname);
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|assets/).*)"] };