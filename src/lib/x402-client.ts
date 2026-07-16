"use client";

import { getActiveProvider } from "@/lib/minipay";

interface X402PaymentResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

export async function payViaX402(
  slug: string,
  amount: string,
  token: string,
  payerAddress: `0x${string}`
): Promise<X402PaymentResult> {
  const url = `/api/x402-pay/${slug}?amount=${amount}&token=${token}`;

  const challengeRes = await fetch(url);

  if (challengeRes.status !== 402) {
    if (challengeRes.ok) {
      return { success: true };
    }
    const body = await challengeRes.json().catch(() => ({}));
    return { success: false, error: body.error || "Unexpected response" };
  }

  const paymentRequiredHeader =
    challengeRes.headers.get("payment-required") ||
    challengeRes.headers.get("x-payment-required");

  if (!paymentRequiredHeader) {
    const body = await challengeRes.json().catch(() => ({}));
    const accepts = body.accepts?.[0];
    if (!accepts) {
      return { success: false, error: "No payment requirements in 402 response" };
    }
    return payViaX402V1(url, accepts, payerAddress);
  }

  let paymentRequired: {
    x402Version: number;
    accepts: Array<{
      scheme: string;
      network: string;
      maxAmountRequired: string;
      asset: string;
      payTo: string;
      extra?: Record<string, unknown>;
    }>;
  };
  try {
    paymentRequired = JSON.parse(atob(paymentRequiredHeader));
  } catch {
    return { success: false, error: "Failed to parse payment requirements" };
  }

  const req = paymentRequired.accepts?.[0];
  if (!req) {
    return { success: false, error: "No accepted payment schemes" };
  }

  const provider = getActiveProvider();
  if (!provider) {
    return { success: false, error: "Wallet not connected" };
  }

  if (req.scheme === "exact" && req.network.startsWith("eip155:")) {
    return settleExactEvm(url, req, payerAddress, provider);
  }

  return { success: false, error: `Unsupported scheme: ${req.scheme}` };
}

async function settleExactEvm(
  resourceUrl: string,
  req: {
    maxAmountRequired: string;
    asset: string;
    payTo: string;
    extra?: Record<string, unknown>;
  },
  payerAddress: `0x${string}`,
  provider: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> }
): Promise<X402PaymentResult> {
  const nonce = `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;
  const validAfter = "0";
  const validBefore = `0x${(Math.floor(Date.now() / 1000) + 3600).toString(16)}`;

  const chainId = await provider.request({ method: "eth_chainId" });
  const chainIdNum =
    typeof chainId === "string"
      ? parseInt(chainId.startsWith("0x") ? chainId : `0x${chainId}`, 16)
      : Number(chainId);

  const domain = {
    name: "USD Coin",
    version: "2",
    chainId: chainIdNum,
    verifyingContract: req.asset,
  };

  const types = {
    EIP712Domain: [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
    ],
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  };

  const message = {
    from: payerAddress,
    to: req.payTo,
    value: req.maxAmountRequired,
    validAfter,
    validBefore,
    nonce,
  };

  const typedData = JSON.stringify({
    types,
    domain,
    primaryType: "TransferWithAuthorization",
    message,
  });

  let signature: string;
  try {
    signature = (await provider.request({
      method: "eth_signTypedData_v4",
      params: [payerAddress, typedData],
    })) as string;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Signing failed";
    if (/rejected|denied|cancelled|canceled/i.test(msg)) {
      return { success: false, error: "cancelled" };
    }
    return { success: false, error: msg };
  }

  const payload = {
    x402Version: 2,
    scheme: "exact",
    network: "eip155:42220",
    payload: {
      authorization: {
        from: payerAddress,
        to: req.payTo,
        value: req.maxAmountRequired,
        validAfter,
        validBefore,
        nonce,
      },
      signature,
      token: req.asset,
    },
  };

  const paymentSignature = btoa(JSON.stringify(payload));

  const settleRes = await fetch(resourceUrl, {
    headers: {
      "PAYMENT-SIGNATURE": paymentSignature,
    },
  });

  if (!settleRes.ok) {
    const body = await settleRes.json().catch(() => ({}));
    return { success: false, error: body.error || "Settlement failed" };
  }

  const responseHeader = settleRes.headers.get("payment-response");
  let txHash: string | undefined;
  if (responseHeader) {
    try {
      const resp = JSON.parse(atob(responseHeader));
      txHash = resp.txHash;
    } catch {}
  }

  return { success: true, txHash };
}

async function payViaX402V1(
  resourceUrl: string,
  accepts: {
    payTo: string;
    extra?: { displayAmount?: string; symbol?: string };
    maxAmountRequired?: string;
    asset?: string;
  },
  payerAddress: `0x${string}`
): Promise<X402PaymentResult> {
  const provider = getActiveProvider();
  if (!provider) {
    return { success: false, error: "Wallet not connected" };
  }

  const { sendToken } = await import("@/lib/minipay");
  const hash = await sendToken(
    accepts.payTo as `0x${string}`,
    accepts.extra?.displayAmount || "0",
    (accepts.extra?.symbol as "cUSD" | "USDC" | "USDT") || "cUSD"
  );

  return { success: true, txHash: hash };
}
