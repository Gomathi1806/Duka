import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMerchantBySlug, getMerchantSales } from '@/app/actions/merchant';
import { TOKENS, type TokenSymbol } from '@/lib/tokens';

export const dynamic = 'force-dynamic'; // sales must always be fresh

const EXPLORER =
  (process.env.NEXT_PUBLIC_CELO_NETWORK || 'celo-alfajores') === 'celo'
    ? 'https://celoscan.io'
    : 'https://alfajores.celoscan.io';

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const merchant = await getMerchantBySlug(slug);
  if (!merchant) notFound();

  const { payments, total, sales } = await getMerchantSales(merchant.id);
  const tokenLabel = TOKENS[merchant.token as TokenSymbol]?.label ?? merchant.token;

  return (
    <main>
      <header style={{ margin: '1.5rem 0' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Dashboard</p>
        <h1 style={{ fontSize: '1.5rem' }}>{merchant.name}</h1>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div className="glass" style={{ padding: '1.25rem', textAlign: 'center' }}>
          <p style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--accent-celo)' }}>${total}</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Total earned ({tokenLabel})</p>
        </div>
        <div className="glass" style={{ padding: '1.25rem', textAlign: 'center' }}>
          <p style={{ fontSize: '1.6rem', fontWeight: 700 }}>{sales}</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Sales</p>
        </div>
      </div>

      <h2 style={{ fontSize: '1rem', margin: '1.5rem 0 0.75rem' }}>Recent payments</h2>
      {payments.length === 0 ? (
        <div className="glass" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          No payments yet. Show your QR to a customer to get started.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          {payments.map((p) => (
            <a
              key={p.id}
              href={`${EXPLORER}/tx/${p.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="glass"
              style={{
                padding: '0.9rem 1.1rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                textDecoration: 'none',
                color: 'white',
              }}
            >
              <div>
                <p style={{ fontWeight: 600 }}>${p.amount}</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  from {shortAddr(p.payerAddress)}
                </p>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : ''} ↗
              </p>
            </a>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1.5rem' }}>
        <Link className="btn btn-primary" href={`/m/${merchant.slug}`}>
          Show my QR code
        </Link>
      </div>
    </main>
  );
}
