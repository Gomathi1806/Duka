'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { connectMiniPay, isMiniPay, merchantTokens, NETWORK, TOKENS, type TokenSymbol } from '@/lib/minipay';
import { createMerchant, getMerchantByWallet } from '@/app/actions/merchant';

type Stage = 'form' | 'creating';

export default function HomePage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('form');
  const [name, setName] = useState('');
  const [wallet, setWallet] = useState('');
  const [presets, setPresets] = useState('1,2,5,10');
  const [token, setToken] = useState<TokenSymbol>('cUSD');
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);

  // Inside MiniPay: auto-connect and jump straight to the QR page for
  // returning merchants — a street vendor shouldn't retype anything
  useEffect(() => {
    if (!isMiniPay()) return;
    setConnecting(true);
    connectMiniPay()
      .then(async ({ address }) => {
        setWallet(address);
        const existing = await getMerchantByWallet(address);
        if (existing) router.push(`/m/${existing.slug}`);
      })
      .catch(() => { /* user declined — they can paste an address instead */ })
      .finally(() => setConnecting(false));
  }, [router]);

  async function connectWallet() {
    setError('');
    setConnecting(true);
    try {
      const { address } = await connectMiniPay();
      setWallet(address);
      const existing = await getMerchantByWallet(address);
      if (existing) {
        router.push(`/m/${existing.slug}`);
        return;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect wallet.');
    } finally {
      setConnecting(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setStage('creating');
    const res = await createMerchant({ walletAddress: wallet.trim(), name, presetAmounts: presets, token });
    if (res.success && res.slug) {
      router.push(`/m/${res.slug}`);
    } else {
      setError(res.error ?? 'Something went wrong.');
      setStage('form');
    }
  }

  return (
    <main>
      <header style={{ textAlign: 'center', margin: '2rem 0 1.5rem' }}>
        <div style={{ fontSize: '2.5rem' }}>🏪</div>
        <h1 style={{ fontSize: '1.7rem', margin: '0.5rem 0 0.25rem' }}>Duka</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
          Turn any shop into a digital till. Accept stablecoins with a QR code — no cash, no bank, no wallet addresses to share.
        </p>
      </header>

      <form className="glass" style={{ padding: '1.5rem', display: 'grid', gap: '1rem' }} onSubmit={submit} autoComplete="off">
        <div>
          <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.4rem' }}>
            Business name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mama Ngozi's Kitchen"
            maxLength={60}
            required
            autoComplete="off"
            style={{ width: '100%', padding: '0.8rem 1rem' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.4rem' }}>
            Wallet address (where you get paid)
          </label>
          <input
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            placeholder="0x…"
            pattern="0x[0-9a-fA-F]{40}"
            required
            autoComplete="off"
            style={{ width: '100%', padding: '0.8rem 1rem', fontFamily: 'monospace', fontSize: '0.85rem' }}
          />
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginTop: '0.5rem', padding: '0.5rem 1rem', fontSize: '0.85rem' }}
            onClick={connectWallet}
            disabled={connecting}
          >
            {connecting ? 'Connecting…' : '⚡ Use my MiniPay wallet'}
          </button>
        </div>

        <div>
          <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.4rem' }}>
            Quick amounts (optional, comma-separated)
          </label>
          <input
            value={presets}
            onChange={(e) => setPresets(e.target.value)}
            placeholder="1,2,5,10"
            style={{ width: '100%', padding: '0.8rem 1rem' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.4rem' }}>
            Currency
          </label>
          <select
            value={token}
            onChange={(e) => setToken(e.target.value as TokenSymbol)}
            style={{ width: '100%', padding: '0.8rem 1rem' }}
          >
            {merchantTokens(NETWORK).map((t) => (
              <option key={t} value={t}>
                {TOKENS[t].label}
              </option>
            ))}
          </select>
        </div>

        <button className="btn btn-primary" type="submit" disabled={stage === 'creating'}>
          {stage === 'creating' ? 'Creating your QR…' : 'Create my payment QR →'}
        </button>

        {error && (
          <p style={{ color: '#ef4444', fontSize: '0.9rem', textAlign: 'center' }}>{error}</p>
        )}
      </form>

      <div className="glass" style={{ padding: '1rem 1.5rem', marginTop: '1rem', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
          Already have a store? Connect your wallet to return.
        </p>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ fontSize: '0.85rem', padding: '0.5rem 1.25rem' }}
          onClick={connectWallet}
          disabled={connecting}
        >
          {connecting ? 'Connecting…' : '🔑 Find my store'}
        </button>
      </div>

      <section style={{ marginTop: '2rem', display: 'grid', gap: '0.75rem' }}>
        {[
          ['🖨️', 'Print your QR or show it on your phone'],
          ['📱', 'Customers scan with MiniPay and pay in seconds'],
          ['💸', 'Funds land directly in your wallet — no middleman, no custody'],
          ['📊', 'Track every sale on your dashboard'],
        ].map(([emoji, text]) => (
          <div key={text} className="glass" style={{ padding: '0.9rem 1.1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <span style={{ fontSize: '1.3rem' }}>{emoji}</span>
            <span style={{ fontSize: '0.9rem' }}>{text}</span>
          </div>
        ))}
      </section>

      <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', margin: '2rem 0 1rem' }}>
        Direct on-chain transfers on Celo · Powered by x402
      </p>
    </main>
  );
}
