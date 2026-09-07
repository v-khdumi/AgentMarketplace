import { NextResponse } from "next/server";
import { entraConfigured } from "@/lib/auth";
import { checkReadiness } from "@/lib/readiness";
import { getRepository, isLocalMode, isPublicDemoMode } from "@/lib/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ready = await checkReadiness({
    configured: isLocalMode() || isPublicDemoMode() || entraConfigured(),
    checkStorage: () => getRepository().check(),
  });
  return NextResponse.json({
    status: ready ? "ready" : "not-ready",
    service: "agent-marketplace",
    timestamp: new Date().toISOString(),
  }, { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
