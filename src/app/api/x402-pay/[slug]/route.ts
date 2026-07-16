import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const results: Record<string, string> = {};

  try {
    await import("@x402/core/server");
    results["@x402/core/server"] = "ok";
  } catch (e) {
    results["@x402/core/server"] = e instanceof Error ? e.message : String(e);
  }

  try {
    await import("@x402/evm/exact/server");
    results["@x402/evm/exact/server"] = "ok";
  } catch (e) {
    results["@x402/evm/exact/server"] = e instanceof Error ? e.message : String(e);
  }

  try {
    await import("@x402/next");
    results["@x402/next"] = "ok";
  } catch (e) {
    results["@x402/next"] = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({ slug, imports: results });
}
