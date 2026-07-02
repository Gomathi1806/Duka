import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseUnits } from 'viem';

// Mock viem's createPublicClient before importing payment
vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>();
  return {
    ...actual,
    createPublicClient: vi.fn(),
  };
});

import { createPublicClient } from 'viem';
import { verifyPayment } from '../payment';
import { TOKENS } from '../minipay';

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const CREATOR = '0xCreator000000000000000000000000000000001' as `0x${string}`;
const PAYER   = '0xPayer00000000000000000000000000000000002' as `0x${string}`;

function makeReceipt(overrides: {
  status?: 'success' | 'reverted';
  tokenAddress?: string;
  to?: string;
  from?: string;
  amount?: bigint;
} = {}) {
  const {
    status = 'success',
    tokenAddress = TOKENS.cUSD.address.celo,
    to = CREATOR,
    from = PAYER,
    amount = parseUnits('1.000000', 18),
  } = overrides;

  // Pad address to 32-byte topic
  const toTopic   = ('0x' + to.slice(2).toLowerCase().padStart(64, '0')) as `0x${string}`;
  const fromTopic = ('0x' + from.slice(2).toLowerCase().padStart(64, '0')) as `0x${string}`;

  return {
    status,
    logs: [{
      address: tokenAddress,
      topics: [TRANSFER_TOPIC as `0x${string}`, fromTopic, toTopic],
      data: ('0x' + amount.toString(16).padStart(64, '0')) as `0x${string}`,
    }],
  };
}

function mockClient(receipt: ReturnType<typeof makeReceipt> | Error) {
  (createPublicClient as ReturnType<typeof vi.fn>).mockReturnValue({
    getTransactionReceipt: receipt instanceof Error
      ? () => Promise.reject(receipt)
      : () => Promise.resolve(receipt),
  });
}

beforeEach(() => { vi.clearAllMocks(); });

describe('verifyPayment — cUSD (18 decimals)', () => {
  const tokenAddress = TOKENS.cUSD.address.celo;

  it('returns valid when transfer matches exactly', async () => {
    mockClient(makeReceipt({ tokenAddress, amount: parseUnits('1.000000', 18) }));
    const r = await verifyPayment({ txHash: '0xabc' as `0x${string}`, recipientAddress: CREATOR, requiredUsd: 1.0, network: 'celo', tokenAddress, tokenDecimals: 18 });
    expect(r.valid).toBe(true);
    if (r.valid) expect(r.payer).toMatch(/^0x/i);
  });

  it('returns valid when transfer is more than required', async () => {
    mockClient(makeReceipt({ tokenAddress, amount: parseUnits('2.000000', 18) }));
    const r = await verifyPayment({ txHash: '0xabc' as `0x${string}`, recipientAddress: CREATOR, requiredUsd: 1.0, network: 'celo', tokenAddress, tokenDecimals: 18 });
    expect(r.valid).toBe(true);
  });

  it('returns invalid for underpayment', async () => {
    mockClient(makeReceipt({ tokenAddress, amount: parseUnits('0.500000', 18) }));
    const r = await verifyPayment({ txHash: '0xabc' as `0x${string}`, recipientAddress: CREATOR, requiredUsd: 1.0, network: 'celo', tokenAddress, tokenDecimals: 18 });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toMatch(/underpayment/i);
  });

  it('returns invalid when tx not found', async () => {
    mockClient(new Error('not found'));
    const r = await verifyPayment({ txHash: '0xabc' as `0x${string}`, recipientAddress: CREATOR, requiredUsd: 1.0, network: 'celo', tokenAddress, tokenDecimals: 18 });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toMatch(/not found/i);
  });

  it('returns invalid when tx reverted', async () => {
    mockClient(makeReceipt({ status: 'reverted' }));
    const r = await verifyPayment({ txHash: '0xabc' as `0x${string}`, recipientAddress: CREATOR, requiredUsd: 1.0, network: 'celo', tokenAddress, tokenDecimals: 18 });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toMatch(/reverted/i);
  });

  it('returns invalid when transfer is to wrong recipient', async () => {
    const wrongAddr = '0xWrong00000000000000000000000000000000003' as `0x${string}`;
    mockClient(makeReceipt({ tokenAddress, to: wrongAddr }));
    const r = await verifyPayment({ txHash: '0xabc' as `0x${string}`, recipientAddress: CREATOR, requiredUsd: 1.0, network: 'celo', tokenAddress, tokenDecimals: 18 });
    expect(r.valid).toBe(false);
  });

  it('returns invalid when wrong token contract emits transfer', async () => {
    const wrongToken = TOKENS.USDC.address.celo;
    mockClient(makeReceipt({ tokenAddress: wrongToken }));
    const r = await verifyPayment({ txHash: '0xabc' as `0x${string}`, recipientAddress: CREATOR, requiredUsd: 1.0, network: 'celo', tokenAddress, tokenDecimals: 18 });
    expect(r.valid).toBe(false);
  });
});

describe('verifyPayment — USDC (6 decimals)', () => {
  const tokenAddress = TOKENS.USDC.address.celo;

  it('returns valid for exact USDC payment', async () => {
    mockClient(makeReceipt({ tokenAddress, amount: parseUnits('0.990000', 6) }));
    const r = await verifyPayment({ txHash: '0xabc' as `0x${string}`, recipientAddress: CREATOR, requiredUsd: 0.99, network: 'celo', tokenAddress, tokenDecimals: 6 });
    expect(r.valid).toBe(true);
  });

  it('rejects underpayment in USDC', async () => {
    // Send 0.98 but require 0.99
    mockClient(makeReceipt({ tokenAddress, amount: parseUnits('0.980000', 6) }));
    const r = await verifyPayment({ txHash: '0xabc' as `0x${string}`, recipientAddress: CREATOR, requiredUsd: 0.99, network: 'celo', tokenAddress, tokenDecimals: 6 });
    expect(r.valid).toBe(false);
  });
});
