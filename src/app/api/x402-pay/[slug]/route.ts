import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { parseUnits } from "viem";
import { getDb } from "@/db";
import { merchants, payments } from "@/db/schema";
import { TOKENS } from "@/lib/tokens";
import type { TokenSymbol, CeloNetwork } from "@/lib/tokens";

// Derive network here — importing NETWORK from the browser-oriented
// minipay module resolves to undefined in the server bundle.
const NETWORK: CeloNetwork =
  process.env.NEXT_PUBLIC_CELO_NETWORK === "celo" ? "celo" : "celo-alfajores";

// The x402 "exact" scheme settles via EIP-3009 transferWithAuthorization.
// On Celo, cUSD/cEUR/cREAL do NOT implement EIP-3009, so the facilitator
// cannot settle them. Circle-native USDC does, so all facilitator-settled
// x402 payments are denominated in USDC regardless of the merchant's
// display token. (The direct-transfer path still uses the merchant token.)
const X402_TOKEN: TokenSymbol = "USDC";

// EIP-712 domain for the settlement token, verified on-chain against the
// USDC contract's DOMAIN_SEPARATOR() on Celo mainnet.
const X402_TOKEN_DOMAIN = { name: "USDC", version: "2" };

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

    const displayAmount = parseFloat(amount).toFixed(2);
    const price = `$${displayAmount}`;

    // The x402 SDK has no default asset for Celo (eip155:42220), so we pass
    // the USDC address and base-unit amount explicitly.
    const tokenDef = TOKENS[X402_TOKEN];
    const tokenAddress = tokenDef?.address?.[NETWORK];
    if (!tokenAddress || tokenAddress === "0x0000000000000000000000000000000000000000") {
      return NextResponse.json(
        {
          error: `${X402_TOKEN} is not available on ${NETWORK}; x402 facilitator settlement is unavailable`,
        },
        { status: 503 }
      );
    }
    const baseUnits = parseUnits(displayAmount, tokenDef.decimals).toString();

    const handler = async () => {
      try {
        await db
          .insert(payments)
          .values({
            merchantId: merchant.id,
            payerAddress: "x402-facilitator",
            txHash: `x402-${Date.now()}-${slug}`,
            amount: displayAmount,
            token: X402_TOKEN,
          })
          .onConflictDoNothing({ target: payments.txHash });
      } catch (e) {
        console.error("[x402-pay] failed to record payment:", e);
      }

      return NextResponse.json({
        success: true,
        merchant: merchant.name,
        amount: price,
        token: X402_TOKEN,
      });
    };

    const wrappedHandler = withX402(
      handler,
      {
        accepts: {
          scheme: "exact",
          payTo: merchant.walletAddress as `0x${string}`,
          price: {
            asset: tokenAddress,
            amount: baseUnits,
            extra: {
              ...X402_TOKEN_DOMAIN,
              decimals: tokenDef.decimals,
              symbol: X402_TOKEN,
              displayAmount,
            },
          },
          network: CELO_NETWORK,
        },
        description: `Payment of ${price} to ${merchant.name}`,
      },
      x402Server
    );

    return await wrappedHandler(req);
  } catch (e) {
    console.error("[x402-pay] route error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    );
  }
}
