import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { merchants, payments } from "@/db/schema";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;

  try {
    const { withX402 } = await import("@x402/next");
    const { x402Server, CELO_NETWORK } = await import("@/lib/x402-server");

    const db = getDb();
    const merchant = await db.query.merchants.findFirst({
      where: eq(merchants.slug, slug.toLowerCase()),
    });
    if (!merchant) {
      return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
    }

    const amount = req.nextUrl.searchParams.get("amount");
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return NextResponse.json(
        { error: "Query param 'amount' is required" },
        { status: 400 }
      );
    }

    const price = `$${parseFloat(amount).toFixed(2)}`;

    const handler = async () => {
      try {
        await db
          .insert(payments)
          .values({
            merchantId: merchant.id,
            payerAddress: "x402-facilitator",
            txHash: `x402-${Date.now()}-${slug}`,
            amount: parseFloat(amount).toFixed(2),
            token: merchant.token,
          })
          .onConflictDoNothing({ target: payments.txHash });
      } catch (e) {
        console.error("[x402-pay] failed to record payment:", e);
      }

      return NextResponse.json({
        success: true,
        merchant: merchant.name,
        amount: price,
      });
    };

    const wrappedHandler = withX402(
      handler,
      {
        accepts: {
          scheme: "exact",
          payTo: merchant.walletAddress as `0x${string}`,
          price,
          network: CELO_NETWORK,
        },
        description: `Payment of ${price} to ${merchant.name}`,
      },
      x402Server
    );

    return wrappedHandler(req);
  } catch (e) {
    console.error("[x402-pay] route error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error", stack: e instanceof Error ? e.stack : undefined },
      { status: 500 }
    );
  }
}
