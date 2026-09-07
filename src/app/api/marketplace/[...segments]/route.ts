import type { NextRequest } from "next/server";
import { marketplaceApi } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function route(request: NextRequest, context: { params: Promise<{ segments: string[] }> }) {
  return marketplaceApi(request, (await context.params).segments);
}
export { route as GET, route as POST, route as PATCH, route as PUT, route as DELETE };