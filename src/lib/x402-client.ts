"use client";

import { createWalletClient, custom } from "viem";
import { celo, celoAlfajores } from "viem/chains";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { getActiveProvider } from "@/lib/minipay";

interface X402PaymentResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

const IS_MAINNET = process.env.NEXT_PUBLIC_CELO_NETWORK === "celo";
const CHAIN = IS_MAINNET ? celo : celoAlfajores;
const CELO_NETWORK = IS_MAINNET ? "eip155:42220" : "eip155:44787";

function isUserRejection(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /rejected|denied|cancelled|canceled/i.test(msg);
}

/**
 * Pays a Duka merchant through the x402 facilitator (protocol v2).
 *
 * The payer signs an EIP-3009 `transferWithAuthorization` and the facilitator
 * broadcasts it, so the payer needs no gas. Settlement is denominated in USDC
 * because Celo's Mento stablecoins (cUSD/cEUR/cREAL) do not implement EIP-3009.
 *
 * Payload construction is delegated to the official x402 client so the wire
 * format (scheme, network, `accepted` requirements) always matches the spec.
 */
export async function payViaX402(
  slug: string,
  amount: string,
  _token: string,
  payerAddress: `0x${string}`
): Promise<X402PaymentResult> {
  const url = `/api/x402-pay/${slug}?amount=${amount}`;

  const provider = getActiveProvider();
  if (!provider) {
    return { success: false, error: "Wallet not connected" };
  }

  const challengeRes = await fetch(url);

  if (challengeRes.status !== 402) {
    if (challengeRes.ok) {
      return { success: true };
    }
    const body = await challengeRes.json().catch(() => ({}));
    return { success: false, error: body.error || "Unexpected response" };
  }

  try {
    const walletClient = createWalletClient({
      account: payerAddress,
      chain: CHAIN,
      transport: custom(provider as Parameters<typeof custom>[0]),
    });

    // The EIP-3009 flow needs only `address` + `signTypedData`. viem handles
    // EIP712Domain injection and bigint encoding for eth_signTypedData_v4.
    const signer = {
      address: payerAddress,
      signTypedData: (args: {
        domain: Record<string, unknown>;
        types: Record<string, unknown>;
        primaryType: string;
        message: Record<string, unknown>;
      }) =>
        walletClient.signTypedData({
          account: payerAddress,
          ...args,
        } as Parameters<typeof walletClient.signTypedData>[0]),
    };

    const client = new x402Client();
    registerExactEvmScheme(client, { signer, networks: [CELO_NETWORK] });
    const httpClient = new x402HTTPClient(client);

    const challengeBody = await challengeRes
      .clone()
      .json()
      .catch(() => undefined);
    const paymentRequired = httpClient.getPaymentRequiredResponse(
      (name) => challengeRes.headers.get(name),
      challengeBody
    );

    const paymentPayload = await httpClient.createPaymentPayload(paymentRequired);
    const headers = httpClient.encodePaymentSignatureHeader(paymentPayload);

    const settleRes = await fetch(url, { headers });

    if (!settleRes.ok) {
      const body = await settleRes.json().catch(() => ({}));
      return { success: false, error: body.error || "Settlement failed" };
    }

    let txHash: string | undefined;
    try {
      const settle = httpClient.getPaymentSettleResponse((name) =>
        settleRes.headers.get(name)
      );
      txHash = settle?.transaction;
    } catch {
      // Settlement succeeded but the receipt header was unreadable.
    }

    return { success: true, txHash };
  } catch (e) {
    if (isUserRejection(e)) {
      return { success: false, error: "cancelled" };
    }
    return {
      success: false,
      error: e instanceof Error ? e.message : "x402 payment failed",
    };
  }
}
