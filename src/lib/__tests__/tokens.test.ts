import { describe, it, expect } from 'vitest';
import {
  TOKENS, ALL_TOKENS, DEFAULT_TOKEN, MINIPAY_TOKENS,
  merchantTokens, isTokenAvailable, type TokenSymbol,
} from '../tokens';

describe('TOKENS config', () => {
  it('has all 5 tokens', () => {
    expect(ALL_TOKENS).toEqual(['cUSD', 'USDC', 'USDT', 'cEUR', 'cREAL']);
  });

  it('default token is cUSD (USDm — the MiniPay default)', () => {
    expect(DEFAULT_TOKEN).toBe('cUSD');
  });

  it('USDC and USDT have 6 decimals', () => {
    expect(TOKENS.USDC.decimals).toBe(6);
    expect(TOKENS.USDT.decimals).toBe(6);
  });

  it('MiniPay tokens are exactly USDm, USDC, USDT (docs.minipay.xyz FAQ Q11)', () => {
    expect(MINIPAY_TOKENS).toEqual(['cUSD', 'USDC', 'USDT']);
  });

  it('USDT is mainnet-only — hidden from merchant choices on Alfajores', () => {
    expect(isTokenAvailable('USDT', 'celo')).toBe(true);
    expect(isTokenAvailable('USDT', 'celo-alfajores')).toBe(false);
    expect(merchantTokens('celo')).toEqual(['cUSD', 'USDC', 'USDT']);
    expect(merchantTokens('celo-alfajores')).toEqual(['cUSD', 'USDC']);
  });

  it('USDT mainnet address matches the Celopedia-verified contract', () => {
    expect(TOKENS.USDT.address.celo).toBe('0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e');
  });

  it('cUSD/cEUR/cREAL have 18 decimals', () => {
    expect(TOKENS.cUSD.decimals).toBe(18);
    expect(TOKENS.cEUR.decimals).toBe(18);
    expect(TOKENS.cREAL.decimals).toBe(18);
  });

  it('every token has mainnet and testnet addresses', () => {
    for (const symbol of ALL_TOKENS) {
      const t = TOKENS[symbol as TokenSymbol];
      expect(t.address.celo).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(t.address['celo-alfajores']).toMatch(/^0x[0-9a-fA-F]{40}$/);
    }
  });

  it('mainnet and testnet addresses differ for each token', () => {
    for (const symbol of ALL_TOKENS) {
      const t = TOKENS[symbol as TokenSymbol];
      expect(t.address.celo.toLowerCase()).not.toBe(t.address['celo-alfajores'].toLowerCase());
    }
  });

  it('no two tokens share the same mainnet address', () => {
    const mainnetAddrs = ALL_TOKENS.map(s => TOKENS[s as TokenSymbol].address.celo.toLowerCase());
    const unique = new Set(mainnetAddrs);
    expect(unique.size).toBe(ALL_TOKENS.length);
  });
});
