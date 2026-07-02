// Shared token config — no "use client" so this is safe to import on server and client

export type CeloNetwork = "celo" | "celo-alfajores";
export type TokenSymbol = "USDC" | "USDT" | "cUSD" | "cEUR" | "cREAL";

const UNDEPLOYED = "0x0000000000000000000000000000000000000000" as const;

export const TOKENS: Record<TokenSymbol, {
  address: Record<CeloNetwork, `0x${string}`>;
  decimals: number;
  label: string;
  symbol: string;
}> = {
  cUSD: {
    address: {
      celo:             "0x765DE816845861e75A25fCA122bb6898B8B1282a",
      "celo-alfajores": "0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1",
    },
    decimals: 18,
    label: "USDm",
    symbol: "$",
  },
  USDC: {
    address: {
      celo:             "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
      "celo-alfajores": "0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B",
    },
    decimals: 6,
    label: "USDC",
    symbol: "$",
  },
  USDT: {
    // Tether has no official Alfajores deployment — mainnet only
    address: {
      celo:             "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
      "celo-alfajores": UNDEPLOYED,
    },
    decimals: 6,
    label: "USDT",
    symbol: "$",
  },
  cEUR: {
    address: {
      celo:             "0xD8763CBa276a3738E6DE85b4b3bF5FDed6D6cA73",
      "celo-alfajores": "0x10c892A6EC43a53E45D0B916B4b7D383B1b78d0F",
    },
    decimals: 18,
    label: "EURm",
    symbol: "€",
  },
  cREAL: {
    address: {
      celo:             "0xe8537a3d056DA446677B9E9d6c5dB704EaAb4787",
      "celo-alfajores": "0xE4D517785D091D3c54818832dB6094bcc2744545",
    },
    decimals: 18,
    label: "BRLm",
    symbol: "R$",
  },
};

export const ALL_TOKENS: TokenSymbol[] = ["cUSD", "USDC", "USDT", "cEUR", "cREAL"];
export const DEFAULT_TOKEN: TokenSymbol = "cUSD";

// The only tokens MiniPay supports (docs.minipay.xyz FAQ Q11) — merchants
// choose from these so customers scanning with MiniPay never hit a dead end
export const MINIPAY_TOKENS: TokenSymbol[] = ["cUSD", "USDC", "USDT"];

export function isTokenAvailable(token: TokenSymbol, network: CeloNetwork): boolean {
  return TOKENS[token].address[network] !== UNDEPLOYED;
}

/** MiniPay-supported tokens that are actually deployed on the given network */
export function merchantTokens(network: CeloNetwork): TokenSymbol[] {
  return MINIPAY_TOKENS.filter((t) => isTokenAvailable(t, network));
}

export const CUSD = {
  celo:             TOKENS.cUSD.address.celo,
  "celo-alfajores": TOKENS.cUSD.address["celo-alfajores"],
} as const;
