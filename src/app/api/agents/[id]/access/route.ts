import type { NextRequest } from "next/server";
import { marketplaceApi } from "@/lib/api";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return marketplaceApi(request, ["agents", (await params).id, "access"]);
}
