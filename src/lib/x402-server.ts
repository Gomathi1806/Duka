import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";

const CELO_NETWORK = "eip155:42220" as const;

const FACILITATOR_URL =
  process.env.X402_FACILITATOR_URL || "https://api.solvador.com";

const facilitatorClient = new HTTPFacilitatorClient({
  url: FACILITATOR_URL,
});

export const x402Server = new x402ResourceServer(facilitatorClient).register(
  CELO_NETWORK,
  new ExactEvmScheme()
);

export { CELO_NETWORK };
