import { describe, it, expect } from 'vitest';
import {
  X402_VERSION,
  buildPaymentRequirements,
  encodePaymentHeader,
  decodePaymentHeader,
  type PaymentPayload,
} from '../x402';
import { TOKENS } from '../tokens';

const MERCHANT = '0x1234567890123456789012345678901234567890' as const;
const TX = ('0x' + 'ab'.repeat(32)) as `0x${string}`;

describe('buildPaymentRequirements', () => {
  it('converts USD amount to atomic units using token decimals', () => {
    const req = buildPaymentRequirements({
      network: 'celo',
      amountUsd: '2.50',
      token: 'cUSD',
      payTo: MERCHANT,
      resource: 'https://example.com/api/x402/shop',
      description: 'test',
    });
    expect(req.maxAmountRequired).toBe('2500000000000000000'); // 2.5 * 10^18
    expect(req.asset).toBe(TOKENS.cUSD.address.celo);
    expect(req.scheme).toBe('exact');
    expect(req.payTo).toBe(MERCHANT);
  });

  it('respects 6-decimal tokens like USDC', () => {
    const req = buildPaymentRequirements({
      network: 'celo',
      amountUsd: '2.50',
      token: 'USDC',
      payTo: MERCHANT,
      resource: 'r',
      description: 'd',
    });
    expect(req.maxAmountRequired).toBe('2500000'); // 2.5 * 10^6
  });
});

describe('X-PAYMENT header codec', () => {
  const payload: PaymentPayload = {
    x402Version: X402_VERSION,
    scheme: 'exact',
    network: 'celo-alfajores',
    payload: { txHash: TX, token: 'cUSD', amount: '5.00' },
  };

  it('round-trips encode → decode', () => {
    expect(decodePaymentHeader(encodePaymentHeader(payload))).toEqual(payload);
  });

  it('rejects garbage headers', () => {
    expect(decodePaymentHeader('not-base64!!')).toBeNull();
    expect(decodePaymentHeader(btoa('{"nope":true}'))).toBeNull();
  });

  it('rejects wrong protocol version', () => {
    const bad = { ...payload, x402Version: 99 };
    expect(decodePaymentHeader(btoa(JSON.stringify(bad)))).toBeNull();
  });

  it('rejects payloads missing a tx hash', () => {
    const bad = { ...payload, payload: { ...payload.payload, txHash: undefined } };
    expect(decodePaymentHeader(btoa(JSON.stringify(bad)))).toBeNull();
  });
});
