import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { merchants, payments } from "@/db/schema";
import { verifyPayment } from "@/lib/payment";
import { TOKENS, isTokenAvailable, type CeloNetwork, type TokenSymbol } from "@/lib/tokens";
import {
  X402_VERSION,
  buildPaymentRequirements,
  decodePaymentHeader,
  encodeSettlementHeader,
  type PaymentPayload,
} from "@/lib/x402";

const NETWORK = (process.env.NEXT_PUBLIC_CELO_NETWORK ?? "celo-alfajores") as CeloNetwork;

function parseAmount(raw: string | null): string | null {
  if (!raw) return null;
  const n = parseFloat(raw);
  if (!isFinite(n) || n <= 0 || n > 10000) return null;
  return n.toFixed(2);
}

/**
 * GET /api/x402/[slug]?amount=5&token=cUSD
 *
 * Without an X-PAYMENT header → HTTP 402 + PaymentRequirements (x402 challenge).
 * With an X-PAYMENT header carrying a tx hash → verify on-chain, record the
 * sale, and return the receipt with an X-PAYMENT-RESPONSE header.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;

  const db = getDb();
  const merchant = await db.query.merchants.findFirst({
    where: eq(merchants.slug, slug.toLowerCase()),
  });
  if (!merchant) {
    return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
  }

  const amount = parseAmount(req.nextUrl.searchParams.get("amount"));
  const tokenParam = req.nextUrl.searchParams.get("token") ?? merchant.token;
  if (!(tokenParam in TOKENS) || !isTokenAvailable(tokenParam as TokenSymbol, NETWORK)) {
    return NextResponse.json(
      { error: `Unsupported token on ${NETWORK}: ${tokenParam}` },
      { status: 400 }
    );
  }
  const token = tokenParam as TokenSymbol;

  if (!amount) {
    return NextResponse.json(
      { error: "Query param 'amount' (0 < amount <= 10000) is required" },
      { status: 400 }
    );
  }

  const requirements = buildPaymentRequirements({
    network: NETWORK,
    amountUsd: amount,
    token,
    payTo: merchant.walletAddress as `0x${string}`,
    resource: req.nextUrl.href,
    description: `Payment of $${amount} to ${merchant.name}`,
  });

  const paymentHeader = req.headers.get("X-PAYMENT");
  if (!paymentHeader) {
    return NextResponse.json(
      {
        x402Version: X402_VERSION,
        error: "X-PAYMENT header is required",
        accepts: [requirements],
      },
      { status: 402 }
    );
  }

  const payload = decodePaymentHeader(paymentHeader);
  if (!payload) {
    return NextResponse.json(
      { x402Version: X402_VERSION, error: "Malformed X-PAYMENT header", accepts: [requirements] },
      { status: 402 }
    );
  }

  return settle(merchant.id, merchant.name, merchant.walletAddress as `0x${string}`, payload, amount);
}

/**
 * POST /api/x402/[slug] — simple JSON body variant of settlement for clients
 * that don't set headers: { txHash, token, amount }
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;

  const db = getDb();
  const merchant = await db.query.merchants.findFirst({
    where: eq(merchants.slug, slug.toLowerCase()),
  });
  if (!merchant) {
    return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
  }

  let body: { txHash?: string; token?: string; amount?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const amount = parseAmount(body.amount ?? null);
  if (!amount) {
    return NextResponse.json({ error: "amount (0 < amount <= 10000) required" }, { status: 400 });
  }
  const token = (body.token ?? merchant.token) as TokenSymbol;
  if (!(token in TOKENS) || !isTokenAvailable(token, NETWORK)) {
    return NextResponse.json({ error: `Unsupported token on ${NETWORK}: ${token}` }, { status: 400 });
  }

  const payload: PaymentPayload = {
    x402Version: X402_VERSION,
    scheme: "exact",
    network: NETWORK,
    payload: { txHash: body.txHash as `0x${string}`, token, amount },
  };

  return settle(merchant.id, merchant.name, merchant.walletAddress as `0x${string}`, payload, amount);
}

async function settle(
  merchantId: string,
  merchantName: string,
  merchantWallet: `0x${string}`,
  payload: PaymentPayload,
  amountUsd: string
) {
  const { txHash, token } = payload.payload;

  if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return NextResponse.json({ error: "Invalid transaction hash format." }, { status: 400 });
  }

  const tokenMeta = TOKENS[token];
  if (!tokenMeta) {
    return NextResponse.json({ error: `Unsupported token: ${token}` }, { status: 400 });
  }

  const verifyArgs = {
    txHash,
    recipientAddress: merchantWallet,
    requiredUsd: parseFloat(amountUsd),
    network: NETWORK,
    tokenAddress: tokenMeta.address[NETWORK],
    tokenDecimals: tokenMeta.decimals,
  };

  let result = await verifyPayment(verifyArgs);

  // Poll up to 4 more times (5s apart) waiting for the block to land
  for (let attempt = 0; attempt < 4 && !result.valid && result.reason.includes("not found"); attempt++) {
    await new Promise((r) => setTimeout(r, 5000));
    result = await verifyPayment(verifyArgs);
  }

  if (!result.valid) {
    console.warn(`[x402/${merchantName}] settlement failed for ${txHash}: ${result.reason}`);
    return NextResponse.json({ error: result.reason }, { status: 402 });
  }

  // Record the sale — txHash is unique, so a replayed settlement is a no-op
  const db = getDb();
  try {
    await db
      .insert(payments)
      .values({
        merchantId,
        payerAddress: result.payer.toLowerCase(),
        txHash,
        amount: parseFloat(amountUsd).toFixed(2),
        token,
      })
      .onConflictDoNothing({ target: payments.txHash });
  } catch (e) {
    // The customer already paid on-chain — never fail the receipt over a DB hiccup
    console.error(`[x402/${merchantName}] failed to record payment ${txHash}:`, e);
  }

  const receipt = {
    success: true as const,
    txHash,
    networkId: NETWORK,
    payer: result.payer,
  };

  return NextResponse.json(receipt, {
    status: 200,
    headers: { "X-PAYMENT-RESPONSE": encodeSettlementHeader(receipt) },
  });
}
