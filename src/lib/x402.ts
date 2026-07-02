// x402 protocol types + helpers (https://x402.org)
// Shared between the /api/x402/[slug] route (server) and the pay page (client).
//
// Flow implemented here (the "exact" scheme, settled by on-chain tx hash):
//   1. Client requests the resource → server replies 402 + PaymentRequirements
//   2. Client pays via eth_sendTransaction (MiniPay) → gets a tx hash
//   3. Client retries with an X-PAYMENT header carrying the tx hash
//   4. Server verifies the ERC-20 transfer on Celo, records the sale, and
//      returns 200 with an X-PAYMENT-RESPONSE settlement receipt header

import { parseUnits } from "viem";
import { TOKENS, type CeloNetwork, type TokenSymbol } from "@/lib/tokens";

export const X402_VERSION = 1;

export type PaymentRequirements = {
  scheme: "exact";
  network: CeloNetwork;
  /** Amount in the token's atomic units, as a decimal string */
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: `0x${string}`;
  maxTimeoutSeconds: number;
  /** ERC-20 contract address of the payment token */
  asset: `0x${string}`;
  extra: { symbol: TokenSymbol; decimals: number; displayAmount: string };
};

export type PaymentRequiredResponse = {
  x402Version: number;
  error: string;
  accepts: PaymentRequirements[];
};

/** Payload the client sends back in the X-PAYMENT header (base64 JSON) */
export type PaymentPayload = {
  x402Version: number;
  scheme: "exact";
  network: CeloNetwork;
  payload: {
    txHash: `0x${string}`;
    token: TokenSymbol;
    /** USD amount the payer claims to have sent — verified on-chain */
    amount: string;
  };
};

export type SettlementResponse = {
  success: boolean;
  txHash: `0x${string}`;
  networkId: CeloNetwork;
  payer: `0x${string}`;
};

export function buildPaymentRequirements(opts: {
  network: CeloNetwork;
  amountUsd: string;
  token: TokenSymbol;
  payTo: `0x${string}`;
  resource: string;
  description: string;
}): PaymentRequirements {
  const meta = TOKENS[opts.token];
  return {
    scheme: "exact",
    network: opts.network,
    maxAmountRequired: parseUnits(opts.amountUsd, meta.decimals).toString(),
    resource: opts.resource,
    description: opts.description,
    mimeType: "application/json",
    payTo: opts.payTo,
    maxTimeoutSeconds: 120,
    asset: meta.address[opts.network],
    extra: { symbol: opts.token, decimals: meta.decimals, displayAmount: opts.amountUsd },
  };
}

// btoa/atob exist in both the browser and the Node/Edge runtimes Next.js uses
export function encodePaymentHeader(payload: PaymentPayload): string {
  return btoa(JSON.stringify(payload));
}

export function decodePaymentHeader(header: string): PaymentPayload | null {
  try {
    const parsed = JSON.parse(atob(header)) as PaymentPayload;
    if (parsed.x402Version !== X402_VERSION || parsed.scheme !== "exact") return null;
    if (!parsed.payload?.txHash) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function encodeSettlementHeader(receipt: SettlementResponse): string {
  return btoa(JSON.stringify(receipt));
}
