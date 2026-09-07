import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { dispatchNotifications } from "@/lib/notification-delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.NOTIFICATIONS_JOB_TOKEN;
  const provided = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret ?? ""}`;
  if (!secret || secret.length < 32 || Buffer.byteLength(provided) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.ENTRA_TENANT_ID) return NextResponse.json({ error: "Tenant configuration is required." }, { status: 503 });
  try { return NextResponse.json(await dispatchNotifications(process.env.ENTRA_TENANT_ID), { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ error: "Notification worker unavailable." }, { status: 503 }); }
}