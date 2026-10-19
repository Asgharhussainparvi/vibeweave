import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Readiness endpoint. This reports whether server configuration exists; it does
 * not make an authenticated request to Qloo and therefore does not prove the key works.
 */
export async function GET() {
  const liveConfigured = Boolean(process.env.QLOO_API_KEY?.trim());
  return NextResponse.json(
    {
      status: "ok",
      app: "vibeweave",
      liveConfigured,
      defaultMode: liveConfigured ? "live-capable" : "demo",
      qlooAuthVerified: false,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
