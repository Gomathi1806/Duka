'use client';

import React, { useEffect, useState } from 'react';
import {
  detectWallet, isMiniPay, sendToken, connectInjected, connectWalletConnect,
  disconnectWallet, getWalletType, NETWORK, TOKENS,
  type TokenSymbol, type WalletType, type ConnectedWallet,
} from '@/lib/minipay';
import { X402_VERSION, encodePaymentHeader, type PaymentRequiredResponse } from '@/lib/x402';
import { miniPayReceiptUrl, miniPayBrowseUrl } from '@/lib/deeplinks';

type Stage =
  | 'detecting'
  | 'connect'
  | 'connecting'
  | 'ready'
  | 'paying'
  | 'verifying'
  | 'paid'
  | 'error';

const EXPLORER = NETWORK === 'celo' ? 'https://celoscan.io' : 'https://alfajores.celoscan.io';

const MINIPAY_DOWNLOAD = 'https://www.opera.com/products/minipay';
const VALORA_DOWNLOAD = 'https://valoraapp.com';

const hasWcProjectId = !!process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

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
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletType, setWalletType] = useState<WalletType | null>(null);
  const [hasInjected, setHasInjected] = useState(false);
  const [copied, setCopied] = useState(false);

  const tokenSymbol = token as TokenSymbol;
  const tokenLabel = TOKENS[tokenSymbol]?.label ?? token;
  const amountNum = parseFloat(amount);
  const amountValid = isFinite(amountNum) && amountNum > 0 && amountNum <= 10000;

  useEffect(() => {
    detectWallet(1500).then((found) => {
      setHasInjected(found);
      if (found) {
        handleConnect('injected');
      } else {
        setStage('connect');
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleConnect(method: 'injected' | 'walletconnect') {
    setStage('connecting');
    setError('');
    try {
      let wallet: ConnectedWallet;
      if (method === 'walletconnect') {
        wallet = await connectWalletConnect();
      } else {
        wallet = await connectInjected();
      }
      setWalletAddress(wallet.address);
      setWalletType(wallet.type);
      setStage('ready');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Connection failed.';
      if (/rejected|denied|cancelled|canceled|closed/i.test(msg)) {
        setStage('connect');
        return;
      }
      setError(msg);
      setStage('connect');
    }
  }

  function handleDisconnect() {
    disconnectWallet();
    setWalletAddress(null);
    setWalletType(null);
    setStage('connect');
  }

  async function pay() {
    if (!amountValid) return;
    setError('');
    const usd = amountNum.toFixed(2);

    try {
      const resourceUrl = `/api/x402/${slug}?amount=${usd}&token=${token}`;
      const challenge = await fetch(resourceUrl);
      if (challenge.status !== 402) {
        throw new Error('Unexpected response from payment endpoint.');
      }
      const { accepts } = (await challenge.json()) as PaymentRequiredResponse;
      const req = accepts?.[0];
      if (!req) throw new Error('No payment requirements returned.');

      setStage('paying');
      const hash = await sendToken(req.payTo, req.extra.displayAmount, req.extra.symbol);
      setTxHash(hash);

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

  // --- Detecting ---
  if (stage === 'detecting') {
    return <p style={{ textAlign: 'center', marginTop: '4rem', color: 'var(--text-muted)' }}>Loading…</p>;
  }

  // --- Connect wallet ---
  if (stage === 'connect' || stage === 'connecting') {
    const pageUrl = typeof window !== 'undefined' ? window.location.href : '';
    const miniPayLink = pageUrl ? miniPayBrowseUrl(pageUrl) : '';

    return (
      <main style={{ textAlign: 'center', marginTop: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Pay {merchantName}</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
          Connect a wallet to pay with {tokenLabel} on Celo
        </p>

        <div className="glass" style={{ padding: '1.5rem', maxWidth: '400px', margin: '0 auto' }}>
          {/* Option 1: Injected wallet (MetaMask, MiniPay in-app, etc.) */}
          {hasInjected && (
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', marginBottom: '0.75rem', fontSize: '1rem' }}
              disabled={stage === 'connecting'}
              onClick={() => handleConnect('injected')}
            >
              {isMiniPay() ? '📱 Connect MiniPay' : '🦊 Connect Wallet'}
            </button>
          )}

          {/* Option 2: WalletConnect (QR code / deep link to mobile wallets) */}
          {hasWcProjectId && (
            <button
              type="button"
              className={hasInjected ? 'btn btn-secondary' : 'btn btn-primary'}
              style={{ width: '100%', marginBottom: '0.75rem', fontSize: '1rem' }}
              disabled={stage === 'connecting'}
              onClick={() => handleConnect('walletconnect')}
            >
              {stage === 'connecting' ? '⏳ Connecting…' : '🔗 Connect with WalletConnect'}
            </button>
          )}

          {/* Option 3: Open in MiniPay (deep link for mobile users) */}
          {!hasInjected && miniPayLink && (
            <a
              href={miniPayLink}
              className={hasWcProjectId ? 'btn btn-secondary' : 'btn btn-primary'}
              style={{ display: 'block', width: '100%', marginBottom: '0.75rem', fontSize: '1rem', textDecoration: 'none' }}
            >
              📱 Open in MiniPay
            </a>
          )}

          {error && (
            <p style={{ color: '#ef4444', fontSize: '0.85rem', marginTop: '0.5rem', marginBottom: '0.75rem' }}>
              {error}
            </p>
          )}

          {/* Copy link + wallet download section */}
          <div style={{
            borderTop: '1px solid var(--border-subtle, rgba(128,128,128,0.2))',
            marginTop: '1rem',
            paddingTop: '1rem',
          }}>
            {!hasInjected && (
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: '100%', marginBottom: '1rem', fontSize: '0.9rem' }}
                  onClick={() => {
                    navigator.clipboard.writeText(pageUrl).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }).catch(() => {});
                  }}
                >
                  {copied ? '✅ Copied!' : '📋 Copy payment link'}
                </button>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
                  Paste this link in your wallet&apos;s built-in browser to pay.
                </p>
              </>
            )}

            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
              Don&apos;t have a wallet? Get started:
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <a
                href={MINIPAY_DOWNLOAD}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
                style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
              >
                📱 Get MiniPay
              </a>
              <a
                href={VALORA_DOWNLOAD}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
                style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
              >
                💚 Get Valora
              </a>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.75rem' }}>
              MiniPay is built into Opera Mini — 16M+ users across Africa.
              <br />Valora is a mobile wallet for Celo with easy onboarding.
            </p>
          </div>
        </div>
      </main>
    );
  }

  // --- Paid ---
  if (stage === 'paid') {
    return (
      <main style={{ textAlign: 'center', marginTop: '3rem' }}>
        <div style={{ fontSize: '3.5rem' }}>✅</div>
        <h1 style={{ fontSize: '1.5rem', margin: '0.75rem 0' }}>
          Paid ${amountNum.toFixed(2)} {tokenLabel}
        </h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>to {merchantName}</p>
        {txHash && (
          <div style={{ display: 'grid', gap: '0.75rem', justifyItems: 'center' }}>
            {walletType === 'minipay' && (
              <a className="btn btn-primary" href={miniPayReceiptUrl(txHash)}>
                🧾 View receipt in MiniPay
              </a>
            )}
            <a
              className="btn btn-secondary"
              href={`${EXPLORER}/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on Celoscan ↗
            </a>
          </div>
        )}
      </main>
    );
  }

  // --- Payment form (ready / paying / verifying / error) ---
  const walletLabel =
    walletType === 'minipay' ? 'MiniPay' :
    walletType === 'walletconnect' ? 'WalletConnect' :
    'Wallet';

  return (
    <main>
      <header style={{ textAlign: 'center', margin: '2rem 0 1.5rem' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.25rem' }}>Paying</p>
        <h1 style={{ fontSize: '1.6rem' }}>{merchantName}</h1>
      </header>

      {walletAddress && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          marginBottom: '1rem',
          fontSize: '0.8rem',
          color: 'var(--text-muted)',
        }}>
          <span style={{
            background: 'var(--bg-subtle, rgba(128,128,128,0.1))',
            padding: '0.25rem 0.6rem',
            borderRadius: '999px',
            fontFamily: 'monospace',
            fontSize: '0.75rem',
          }}>
            {walletLabel}: {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
          </span>
          <button
            type="button"
            onClick={handleDisconnect}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '0.8rem',
              textDecoration: 'underline',
            }}
          >
            Switch
          </button>
        </div>
      )}

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
          {stage === 'paying' && `⏳ Confirm in ${walletLabel}…`}
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
