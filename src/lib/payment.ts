import { createPublicClient, http, parseUnits, type Hash } from "viem";
import { celo, celoAlfajores } from "viem/chains";
import type { CeloNetwork } from "./tokens";

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as `0x${string}`;

// Multiple fallback RPCs — forno rate-limits aggressively on serverless
const RPC_URLS: Record<CeloNetwork, string[]> = {
  celo: [
    process.env.CELO_RPC_URL ?? "",
    "https://celo.drpc.org",
    "https://rpc.ankr.com/celo",
    "https://forno.celo.org",
  ].filter(Boolean),
  "celo-alfajores": [
    process.env.CELO_ALFAJORES_RPC_URL ?? "",
    "https://alfajores-forno.celo-testnet.org",
  ].filter(Boolean),
};

function getClient(network: CeloNetwork, rpcIndex = 0) {
  const urls = RPC_URLS[network];
  const url = urls[rpcIndex % urls.length];
  return createPublicClient({
    chain: network === "celo" ? celo : celoAlfajores,
    transport: http(url),
  });
}

export type PaymentResult =
  | { valid: true; payer: `0x${string}` }
  | { valid: false; reason: string };

export async function verifyPayment({
  txHash,
  recipientAddress,
  requiredUsd,
  network,
  tokenAddress,
  tokenDecimals = 18,
}: {
  txHash: Hash;
  recipientAddress: `0x${string}`;
  requiredUsd: number;
  network: CeloNetwork;
  tokenAddress: `0x${string}`;
  tokenDecimals?: number;
}): Promise<PaymentResult> {
  const client = getClient(network);
  // Use 6 decimal places for USD amounts — more than sufficient precision for all supported tokens
  const required = parseUnits(requiredUsd.toFixed(6), tokenDecimals);

  let receipt: Awaited<ReturnType<typeof client.getTransactionReceipt>> | null = null;
  const urls = RPC_URLS[network];
  for (let i = 0; i < urls.length; i++) {
    try {
      receipt = await getClient(network, i).getTransactionReceipt({ hash: txHash });
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[verifyPayment] RPC ${urls[i]} failed for ${txHash}: ${msg}`);
    }
  }
  if (!receipt) {
    return { valid: false, reason: "Transaction not found on Celo." };
  }

  if (receipt.status !== "success") {
    return { valid: false, reason: "Transaction reverted." };
  }

  for (const log of receipt.logs) {
    if (
      log.address.toLowerCase() !== tokenAddress.toLowerCase() ||
      log.topics[0] !== TRANSFER_TOPIC ||
      log.topics.length < 3
    ) continue;

    const toAddr = ("0x" + log.topics[2]!.slice(26).toLowerCase()) as `0x${string}`;
    if (toAddr !== recipientAddress.toLowerCase()) continue;

    const amount = BigInt(log.data);
    if (amount >= required) {
      const payer = ("0x" + log.topics[1]!.slice(26)) as `0x${string}`;
      return { valid: true, payer };
    }
    return { valid: false, reason: `Underpayment: received ${amount}, required ${required}.` };
  }

  return { valid: false, reason: `No ${tokenAddress} transfer to recipient found in transaction.` };
}
