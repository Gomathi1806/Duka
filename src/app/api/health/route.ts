import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { merchants } from "@/db/schema";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Lightweight health check — verifies DB connection is alive
// Visit /api/health to confirm env vars + DB are wired correctly on Vercel
export async function GET() {
  const checks: Record<string, string> = {
    DATABASE_URL: process.env.DATABASE_URL ? "✓ set" : "✗ MISSING",
    NEXT_PUBLIC_CELO_NETWORK: `✓ ${process.env.NEXT_PUBLIC_CELO_NETWORK ?? "celo-alfajores (default)"}`,
  };

  try {
    const db = getDb();
    // Run a trivial query to confirm connectivity
    await db.select({ count: sql<number>`count(*)` }).from(merchants);
    checks.db_connection = "✓ connected";
  } catch (e) {
    checks.db_connection = `✗ FAILED: ${e instanceof Error ? e.message : String(e)}`;
  }

  const allOk = Object.values(checks).every(v => v.startsWith("✓"));
  return NextResponse.json({ ok: allOk, checks }, { status: allOk ? 200 : 500 });
}
