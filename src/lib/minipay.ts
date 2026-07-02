"use client";

import { encodeFunctionData, parseUnits } from "viem";
export type { CeloNetwork, TokenSymbol } from "@/lib/tokens";
export {
  TOKENS, ALL_TOKENS, DEFAULT_TOKEN, CUSD,
  MINIPAY_TOKENS, merchantTokens, isTokenAvailable,
} from "@/lib/tokens";
import { TOKENS, DEFAULT_TOKEN, CUSD, isTokenAvailable } from "@/lib/tokens";
import type { CeloNetwork, TokenSymbol } from "@/lib/tokens";

export const NETWORK: CeloNetwork =
  (process.env.NEXT_PUBLIC_CELO_NETWORK as CeloNetwork) || "celo-alfajores";

const CHAIN_MAP = {
  celo:             { chainId: 42220, chainIdHex: "0xa4ec" as const },
  "celo-alfajores": { chainId: 44787, chainIdHex: "0xaef3" as const },
} as const;

const ERC20_TRANSFER_ABI = [{
  name: "transfer",
  type: "function",
  inputs: [
    { name: "recipient", type: "address" },
    { name: "amount",    type: "uint256" },
  ],
  outputs: [{ name: "", type: "bool" }],
}] as const;

export function isMiniPay(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window.ethereum as { isMiniPay?: boolean } | undefined)?.isMiniPay;
}

export async function detectMiniPay(timeoutMs = 2000): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if ((window.ethereum as { isMiniPay?: boolean } | undefined)?.isMiniPay) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

/**
 * Detects MiniPay OR any other injected EVM wallet (MetaMask, Valora, etc).
 * Lets reviewers/testers use the app in a regular desktop or mobile browser
 * without MiniPay installed — MiniPay-specific UX still kicks in via isMiniPay().
 */
export async function detectWallet(timeoutMs = 2000): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (window.ethereum) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

export type ConnectedWallet = { address: `0x${string}` };

let _address: `0x${string}` | null = null;

export async function connectMiniPay(): Promise<ConnectedWallet> {
  const provider = window.ethereum;
  if (!provider) throw new Error("No wallet extension detected.");

  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as `0x${string}`[];

  const address = accounts[0];
  if (!address) throw new Error("No wallet address returned.");
  _address = address;

  // Inside MiniPay, try to switch network but don't throw if it fails
  if (isMiniPay()) {
    try {
      const current = await provider.request({ method: "eth_chainId" });
      const currentId = typeof current === "string"
        ? parseInt(current.startsWith("0x") ? current : `0x${current}`, 16)
        : Number(current);
      if (currentId !== CHAIN_MAP[NETWORK].chainId) {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: CHAIN_MAP[NETWORK].chainIdHex }],
        });
      }
    } catch {
      // MiniPay may reject network switching — proceed and let the user's
      // current network be used; mismatch will surface at verify time
    }
    return { address };
  }

  const { chainIdHex } = CHAIN_MAP[NETWORK];
  try {
    const current = (await provider.request({ method: "eth_chainId" }));
    let currentChainId: number;
    if (typeof current === "number") {
      currentChainId = current;
    } else if (typeof current === "string") {
      if (current.startsWith("0x")) {
        currentChainId = parseInt(current, 16);
      } else {
        currentChainId = parseInt(current, 10);
      }
    } else {
      currentChainId = parseInt(String(current), 16);
    }

    if (currentChainId !== CHAIN_MAP[NETWORK].chainId) {
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: chainIdHex }],
        });
      } catch (switchError: any) {
        // Check standard 4902 error codes or message contents indicating missing chain configuration
        const isChainMissing = 
          switchError.code === 4902 || 
          switchError.data?.originalError?.code === 4902 ||
          switchError.data?.code === 4902 ||
          switchError.message?.toLowerCase().includes("unrecognized") ||
          switchError.message?.toLowerCase().includes("added");

        if (isChainMissing) {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: chainIdHex,
                chainName: NETWORK === "celo" ? "Celo Mainnet" : "Celo Alfajores Testnet",
                nativeCurrency: {
                  name: "CELO",
                  symbol: "CELO",
                  decimals: 18,
                },
                rpcUrls: [
                  NETWORK === "celo"
                    ? "https://forno.celo.org"
                    : "https://alfajores-forno.celo-testnet.org",
                ],
                blockExplorerUrls: [
                  NETWORK === "celo"
                    ? "https://celoscan.io"
                    : "https://alfajores.celoscan.io",
                ],
              },
            ],
          });
        } else {
          throw switchError;
        }
      }
    }
  } catch (err: any) {
    console.error("Failed to switch/add network", err);
    throw new Error(err?.message ?? "Please switch your wallet network to Celo to continue.");
  }

  return { address };
}

/**
 * Send any supported stablecoin to a recipient via MiniPay.
 * Handles decimals correctly: USDC=6 decimals, cUSD/cEUR/cREAL=18 decimals.
 */
export async function sendToken(
  recipientAddress: `0x${string}`,
  amountUsd: string,
  token: TokenSymbol = DEFAULT_TOKEN
): Promise<`0x${string}`> {
  const provider = window.ethereum;
  if (!provider) throw new Error("Wallet not found.");

  if (!isTokenAvailable(token, NETWORK)) {
    throw new Error(`${TOKENS[token].label} is not available on ${NETWORK}.`);
  }

  const { address } = await connectMiniPay();
  const { address: contractAddrs, decimals } = TOKENS[token];
  const tokenContract = contractAddrs[NETWORK];
  const amountWei = parseUnits(amountUsd, decimals);

  const data = encodeFunctionData({
    abi: ERC20_TRANSFER_ABI,
    functionName: "transfer",
    args: [recipientAddress, amountWei],
  });

  return (await provider.request({
    method: "eth_sendTransaction",
    params: [{ from: address, to: tokenContract, data }],
  })) as `0x${string}`;
}

// Backward-compatible alias
export async function sendCUSD(
  recipientAddress: `0x${string}`,
  amountUsd: string
): Promise<`0x${string}`> {
  return sendToken(recipientAddress, amountUsd, "cUSD");
}

export function disconnectMiniPay() {
  _address = null;
}
