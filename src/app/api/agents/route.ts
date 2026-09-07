import type { NextRequest } from "next/server";
import { marketplaceApi } from "@/lib/api";

export const dynamic = "force-dynamic";
export function GET(request: NextRequest) { return marketplaceApi(request, ["agents"]); }
export function POST(request: NextRequest) { return marketplaceApi(request, ["agents"]); }
