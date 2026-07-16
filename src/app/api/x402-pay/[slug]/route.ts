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

// EIP-712 domain per token, needed by wallets to sign transferWithAuthorization
const EIP712_DOMAINS: Record<TokenSymbol, { name: string; version: string }> = {
  cUSD: { name: "Celo Dollar", version: "1" },
  USDC: { name: "USD Coin", version: "2" },
  USDT: { name: "Tether USD", version: "1" },
  cEUR: { name: "Celo Euro", version: "1" },
  cREAL: { name: "Celo Brazilian Real", version: "1" },
};

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

    // The x402 SDK has no default asset for Celo (eip155:42220), so we must
    // pass the token address and base-unit amount explicitly.
    const tokenSymbol = (merchant.token as TokenSymbol) in TOKENS
      ? (merchant.token as TokenSymbol)
      : "cUSD";
    const tokenDef = TOKENS[tokenSymbol];
    const tokenAddress = tokenDef?.address?.[NETWORK];
    if (!tokenAddress || tokenAddress === "0x0000000000000000000000000000000000000000") {
      return NextResponse.json(
        {
          error: "Token not available on this network",
          debug: { merchantToken: merchant.token, tokenSymbol, network: NETWORK, tokenAddress },
        },
        { status: 500 }
      );
    }
    const baseUnits = parseUnits(parseFloat(amount).toFixed(2), tokenDef.decimals).toString();

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
          price: {
            asset: tokenAddress,
            amount: baseUnits,
            extra: {
              ...EIP712_DOMAINS[tokenSymbol],
              decimals: tokenDef.decimals,
              symbol: tokenSymbol,
              displayAmount: parseFloat(amount).toFixed(2),
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
      {
        error: e instanceof Error ? e.message : "Internal error",
        stack: e instanceof Error ? e.stack?.split("\n").slice(0, 5) : undefined,
      },
      { status: 500 }
    );
  }
}
