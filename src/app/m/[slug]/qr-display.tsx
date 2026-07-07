'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import QRCode from '@/components/QRCode';
import { miniPayBrowseUrl } from '@/lib/deeplinks';

export default function QRDisplay({
  slug,
  merchantName,
  presets,
}: {
  slug: string;
  merchantName: string;
  presets: string[];
}) {
  const [origin, setOrigin] = useState('');
  const [selectedAmount, setSelectedAmount] = useState(''); // '' = open amount
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const payUrl = origin
    ? `${origin}/pay/${slug}${selectedAmount ? `?amount=${selectedAmount}` : ''}`
    : '';

  // The QR carries the MiniPay browse deeplink so a camera-app scan opens
  // the pay page inside MiniPay (wallet injected) rather than a bare browser.
  // The visible/copyable link stays the plain URL — readable and shareable.
  const qrValue = payUrl ? miniPayBrowseUrl(payUrl) : '';

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(payUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — ignore */
    }
  }

  return (
    <main>
      {/* print stylesheet: show only the QR card when printing */}
      <style>{`
        @media print {
          body { background: white !important; color: black !important; }
          .no-print { display: none !important; }
          .print-card { border: none !important; background: white !important; }
          .print-card h1, .print-card p { color: black !important; }
        }
      `}</style>

      <header className="no-print" style={{ textAlign: 'center', margin: '1.5rem 0' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Your payment QR</p>
      </header>

      <div className="glass print-card" style={{ padding: '2rem 1.5rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.4rem', marginBottom: '0.25rem' }}>{merchantName}</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
          Scan with MiniPay to pay{selectedAmount ? ` $${selectedAmount}` : ''}
        </p>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          {payUrl ? (
            <QRCode value={payUrl} size={260} />
          ) : (
            <div style={{ width: 260, height: 260 }} />
          )}
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '1rem', wordBreak: 'break-all' }}>
          {payUrl}
        </p>
      </div>

      <div className="no-print">
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center', marginTop: '1.25rem' }}>
          <button
            type="button"
            className={`btn ${selectedAmount === '' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
            onClick={() => setSelectedAmount('')}
          >
            Any amount
          </button>
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              className={`btn ${selectedAmount === p ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
              onClick={() => setSelectedAmount(p)}
            >
              ${p}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1.5rem' }}>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            🖨️ Print QR
          </button>
          <button type="button" className="btn btn-secondary" onClick={copyLink}>
            {copied ? '✓ Copied' : '🔗 Copy payment link'}
          </button>
          <Link className="btn btn-secondary" href={`/dashboard/${slug}`}>
            📊 View sales dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
