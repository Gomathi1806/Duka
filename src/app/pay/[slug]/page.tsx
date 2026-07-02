import { notFound } from 'next/navigation';
import { getMerchantBySlug } from '@/app/actions/merchant';
import PayClient from './pay-client';

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ amount?: string }>;
}) {
  const [{ slug }, { amount }] = await Promise.all([params, searchParams]);

  const merchant = await getMerchantBySlug(slug);
  if (!merchant) notFound();

  const presets = (merchant.presetAmounts ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <PayClient
      slug={merchant.slug}
      merchantName={merchant.name}
      token={merchant.token}
      presets={presets}
      initialAmount={amount ?? ''}
    />
  );
}
