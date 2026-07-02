'use server';

import { getDb } from '@/db';
import { merchants, payments } from '@/db/schema';
import { eq, desc, sum, count } from 'drizzle-orm';
import { merchantTokens, type CeloNetwork } from '@/lib/tokens';

const NETWORK = (process.env.NEXT_PUBLIC_CELO_NETWORK || 'celo-alfajores') as CeloNetwork;

const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;

/** Parse + sanitize a comma-separated preset amounts string, e.g. "1, 2,5" → "1,2,5" */
function cleanPresets(raw: string): string {
  return raw
    .split(',')
    .map((s) => parseFloat(s.trim()))
    .filter((n) => isFinite(n) && n > 0 && n <= 10000)
    .slice(0, 6)
    .map((n) => (Number.isInteger(n) ? String(n) : n.toFixed(2)))
    .join(',');
}

export async function createMerchant(data: {
  walletAddress: string;
  name: string;
  presetAmounts?: string;
  token?: string;
}): Promise<{ success: boolean; slug?: string; error?: string }> {
  try {
    if (!process.env.DATABASE_URL) {
      return {
        success: false,
        error: 'Database not configured — set DATABASE_URL in .env.local (see env.template).',
      };
    }
    if (!WALLET_RE.test(data.walletAddress)) {
      return { success: false, error: 'Invalid wallet address.' };
    }
    const name = data.name.trim().slice(0, 60);
    if (!name) return { success: false, error: 'Business name is required.' };

    // Only MiniPay-supported tokens deployed on the active network
    const token = data.token && (merchantTokens(NETWORK) as string[]).includes(data.token)
      ? data.token
      : 'cUSD';

    const db = getDb();
    const wallet = data.walletAddress.toLowerCase();

    // Returning merchant — same wallet just gets their existing store back
    const existing = await db.query.merchants.findFirst({
      where: eq(merchants.walletAddress, wallet),
    });
    if (existing) return { success: true, slug: existing.slug };

    // Derive a URL-safe slug; last candidate is wallet-derived so it never collides
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'shop';

    const candidates = [base, `${base}-${wallet.slice(2, 6)}`, `shop-${wallet.slice(2, 10)}`];
    let slug = candidates[candidates.length - 1]!;
    for (const candidate of candidates) {
      const taken = await db.query.merchants.findFirst({ where: eq(merchants.slug, candidate) });
      if (!taken) { slug = candidate; break; }
    }

    await db.insert(merchants).values({
      walletAddress: wallet,
      name,
      slug,
      presetAmounts: cleanPresets(data.presetAmounts ?? ''),
      token,
    });

    return { success: true, slug };
  } catch (e) {
    console.error('[createMerchant] error:', e);
    return { success: false, error: 'Failed to create store. Please try again.' };
  }
}

export async function getMerchantBySlug(slug: string) {
  const db = getDb();
  return (
    (await db.query.merchants.findFirst({ where: eq(merchants.slug, slug.toLowerCase()) })) ?? null
  );
}

export async function getMerchantByWallet(walletAddress: string) {
  const db = getDb();
  return (
    (await db.query.merchants.findFirst({
      where: eq(merchants.walletAddress, walletAddress.toLowerCase()),
    })) ?? null
  );
}

export async function getMerchantSales(merchantId: string) {
  const db = getDb();
  const [rows, [totals]] = await Promise.all([
    db.query.payments.findMany({
      where: eq(payments.merchantId, merchantId),
      orderBy: desc(payments.createdAt),
      limit: 100,
    }),
    db
      .select({ total: sum(payments.amount), sales: count() })
      .from(payments)
      .where(eq(payments.merchantId, merchantId)),
  ]);
  return {
    payments: rows,
    total: parseFloat(totals?.total ?? '0').toFixed(2),
    sales: totals?.sales ?? 0,
  };
}
