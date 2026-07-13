"use client";

import { encodeFunctionData, parseUnits, concatHex } from "viem";
import { toDataSuffix } from "@celo/attribution-tags";
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

const ATTRIBUTION_TAG = toDataSuffix("celo_ec660205f1c4") as `0x${string}`;

const ERC20_TRANSFER_ABI = [{
  name: "transfer",
  type: "function",
  inputs: [
    { name: "recipient", type: "address" },
    { name: "amount",    type: "uint256" },
  ],
  outputs: [{ name: "", type: "bool" }],
}] as const;

type EIP1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

export type WalletType = "minipay" | "injected" | "walletconnect";

let _activeProvider: EIP1193Provider | null = null;
let _activeWalletType: WalletType | null = null;
let _address: `0x${string}` | null = null;

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

export async function detectWallet(timeoutMs = 2000): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (window.ethereum) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

export type ConnectedWallet = { address: `0x${string}`; type: WalletType };

export function getActiveProvider(): EIP1193Provider | null {
  return _activeProvider ?? (typeof window !== "undefined" ? window.ethereum as EIP1193Provider | undefined : undefined) ?? null;
}

export function getWalletType(): WalletType | null {
  return _activeWalletType;
}

export async function connectInjected(): Promise<ConnectedWallet> {
  const provider = window.ethereum;
  if (!provider) throw new Error("No wallet extension detected.");
  _activeProvider = provider as unknown as EIP1193Provider;

  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as `0x${string}`[];

  const address = accounts[0];
  if (!address) throw new Error("No wallet address returned.");
  _address = address;

  const walletType: WalletType = isMiniPay() ? "minipay" : "injected";
  _activeWalletType = walletType;

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
      // MiniPay may reject network switching — proceed
    }
    return { address, type: walletType };
  }

  const { chainIdHex } = CHAIN_MAP[NETWORK];
  try {
    const current = (await provider.request({ method: "eth_chainId" }));
    let currentChainId: number;
    if (typeof current === "number") {
      currentChainId = current;
    } else if (typeof current === "string") {
      currentChainId = current.startsWith("0x")
        ? parseInt(current, 16)
        : parseInt(current, 10);
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
                nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
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

  return { address, type: walletType };
}

// Backward-compatible alias
export const connectMiniPay = connectInjected;

export async function connectWalletConnect(): Promise<ConnectedWallet> {
  const { default: EthereumProvider } = await import("@walletconnect/ethereum-provider");

  const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
  if (!projectId) throw new Error("WalletConnect is not configured. Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID.");

  const chainId = CHAIN_MAP[NETWORK].chainId;

  const provider = await EthereumProvider.init({
    projectId,
    chains: [chainId],
    showQrModal: true,
    metadata: {
      name: "Duka",
      description: "Pay merchants on Celo",
      url: typeof window !== "undefined" ? window.location.origin : "https://duka.app",
      icons: [],
    },
  });

  await provider.connect();

  const accounts = provider.accounts;
  const address = accounts[0] as `0x${string}`;
  if (!address) throw new Error("No account returned from WalletConnect.");

  _activeProvider = provider as unknown as EIP1193Provider;
  _activeWalletType = "walletconnect";
  _address = address;

  return { address, type: "walletconnect" };
}

export async function sendToken(
  recipientAddress: `0x${string}`,
  amountUsd: string,
  token: TokenSymbol = DEFAULT_TOKEN
): Promise<`0x${string}`> {
  const provider = getActiveProvider();
  if (!provider) throw new Error("Wallet not connected.");

  if (!isTokenAvailable(token, NETWORK)) {
    throw new Error(`${TOKENS[token].label} is not available on ${NETWORK}.`);
  }

  if (!_address) {
    const { address } = await connectInjected();
    _address = address;
  }

  const { address: contractAddrs, decimals } = TOKENS[token];
  const tokenContract = contractAddrs[NETWORK];
  const amountWei = parseUnits(amountUsd, decimals);

  const calldata = encodeFunctionData({
    abi: ERC20_TRANSFER_ABI,
    functionName: "transfer",
    args: [recipientAddress, amountWei],
  });

  const data = concatHex([calldata, ATTRIBUTION_TAG]);

  return (await provider.request({
    method: "eth_sendTransaction",
    params: [{ from: _address, to: tokenContract, data }],
  })) as `0x${string}`;
}

export async function sendCUSD(
  recipientAddress: `0x${string}`,
  amountUsd: string
): Promise<`0x${string}`> {
  return sendToken(recipientAddress, amountUsd, "cUSD");
}

export function disconnectWallet() {
  if (_activeWalletType === "walletconnect" && _activeProvider) {
    (_activeProvider as any).disconnect?.();
  }
  _activeProvider = null;
  _activeWalletType = null;
  _address = null;
}

// Backward-compatible alias
export const disconnectMiniPay = disconnectWallet;
