'use client';

import React, { useEffect, useState } from 'react';
import { detectWallet, sendToken, NETWORK, TOKENS, type TokenSymbol } from '@/lib/minipay';
import { X402_VERSION, encodePaymentHeader, type PaymentRequiredResponse } from '@/lib/x402';

type Stage = 'detecting' | 'no-wallet' | 'ready' | 'paying' | 'verifying' | 'paid' | 'error';

const EXPLORER = NETWORK === 'celo' ? 'https://celoscan.io' : 'https://alfajores.celoscan.io';

export default function PayClient({
  slug,
  merchantName,
  token,
  presets,
  initialAmount,
}: {
  slug: string;
  merchantName: string;
  token: string;
  presets: string[];
  initialAmount: string;
}) {
  const [stage, setStage] = useState<Stage>('detecting');
  const [amount, setAmount] = useState(initialAmount);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState('');

  const tokenSymbol = token as TokenSymbol;
  const tokenLabel = TOKENS[tokenSymbol]?.label ?? token;
  const amountNum = parseFloat(amount);
  const amountValid = isFinite(amountNum) && amountNum > 0 && amountNum <= 10000;

  useEffect(() => {
    detectWallet().then((found) => setStage(found ? 'ready' : 'no-wallet'));
  }, []);

  async function pay() {
    if (!amountValid) return;
    setError('');
    const usd = amountNum.toFixed(2);

    try {
      // x402 step 1: request the resource — expect a 402 challenge with
      // payment requirements (who to pay, which token contract, how much)
      const resourceUrl = `/api/x402/${slug}?amount=${usd}&token=${token}`;
      const challenge = await fetch(resourceUrl);
      if (challenge.status !== 402) {
        throw new Error('Unexpected response from payment endpoint.');
      }
      const { accepts } = (await challenge.json()) as PaymentRequiredResponse;
      const req = accepts?.[0];
      if (!req) throw new Error('No payment requirements returned.');

      // x402 step 2: pay on-chain via MiniPay (eth_sendTransaction)
      setStage('paying');
      const hash = await sendToken(req.payTo, req.extra.displayAmount, req.extra.symbol);
      setTxHash(hash);

      // x402 step 3: retry the resource with the X-PAYMENT header — server
      // verifies the transfer on Celo and returns the settlement receipt
      setStage('verifying');
      const settled = await fetch(resourceUrl, {
        headers: {
          'X-PAYMENT': encodePaymentHeader({
            x402Version: X402_VERSION,
            scheme: 'exact',
            network: req.network,
            payload: { txHash: hash, token: req.extra.symbol, amount: usd },
          }),
        },
      });

      if (!settled.ok) {
        const body = await settled.json().catch(() => ({ error: 'Verification failed.' }));
        throw new Error(body.error ?? 'Verification failed.');
      }

      setStage('paid');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Payment failed.';
      // User rejected in wallet — back to ready, no scary error screen
      if (/rejected|denied|cancelled|canceled/i.test(msg)) {
        setStage('ready');
        setError('Payment cancelled.');
        return;
      }
      console.error('[pay] error:', e);
      setError(msg);
      setStage(txHash ? 'error' : 'ready');
    }
  }

  if (stage === 'detecting') {
    return <p style={{ textAlign: 'center', marginTop: '4rem', color: 'var(--text-muted)' }}>Loading…</p>;
  }

  if (stage === 'no-wallet') {
    return (
      <main style={{ textAlign: 'center', marginTop: '3rem' }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Pay {merchantName}</h1>
        <div className="glass" style={{ padding: '1.5rem' }}>
          <p style={{ marginBottom: '0.75rem' }}>📱 Open this page inside <strong>MiniPay</strong> to pay.</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            In Opera Mini or the MiniPay app, scan the merchant&apos;s QR code again.
          </p>
        </div>
      </main>
    );
  }

  if (stage === 'paid') {
    return (
      <main style={{ textAlign: 'center', marginTop: '3rem' }}>
        <div style={{ fontSize: '3.5rem' }}>✅</div>
        <h1 style={{ fontSize: '1.5rem', margin: '0.75rem 0' }}>
          Paid ${amountNum.toFixed(2)} {tokenLabel}
        </h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>to {merchantName}</p>
        {txHash && (
          <a
            className="btn btn-secondary"
            href={`${EXPLORER}/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            View receipt on Celoscan ↗
          </a>
        )}
      </main>
    );
  }

  return (
    <main>
      <header style={{ textAlign: 'center', margin: '2rem 0 1.5rem' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>Paying</p>
        <h1 style={{ fontSize: '1.6rem' }}>{merchantName}</h1>
      </header>

      <div className="glass" style={{ padding: '1.5rem' }}>
        <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
          Amount ({tokenLabel})
        </label>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={stage === 'paying' || stage === 'verifying'}
          style={{ width: '100%', padding: '0.9rem 1rem', fontSize: '1.4rem', fontWeight: 600 }}
        />

        {presets.length > 0 && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
            {presets.map((p) => (
              <button
                key={p}
                type="button"
                className="btn btn-secondary"
                style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
                onClick={() => setAmount(p)}
              >
                ${p}
              </button>
            ))}
          </div>
        )}

        <button
          className="btn btn-primary"
          style={{ width: '100%', marginTop: '1.25rem', fontSize: '1.05rem' }}
          disabled={!amountValid || stage === 'paying' || stage === 'verifying'}
          onClick={pay}
        >
          {stage === 'paying' && '⏳ Confirm in MiniPay…'}
          {stage === 'verifying' && '🔎 Verifying on Celo…'}
          {(stage === 'ready' || stage === 'error') &&
            (amountValid ? `Pay $${amountNum.toFixed(2)}` : 'Enter amount')}
        </button>

        {error && (
          <p style={{ color: '#ef4444', fontSize: '0.9rem', marginTop: '0.75rem', textAlign: 'center' }}>
            {error}
            {stage === 'error' && txHash && (
              <>
                {' '}
                <a href={`${EXPLORER}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-celo)' }}>
                  Check transaction ↗
                </a>
              </>
            )}
          </p>
        )}
      </div>

      <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '1.5rem' }}>
        Funds go directly to the merchant&apos;s wallet on Celo. Powered by x402.
      </p>
    </main>
  );
}
