import { notFound } from 'next/navigation';
import { getMerchantBySlug } from '@/app/actions/merchant';
import QRDisplay from './qr-display';

export default async function MerchantQRPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const merchant = await getMerchantBySlug(slug);
  if (!merchant) notFound();

  const presets = (merchant.presetAmounts ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return <QRDisplay slug={merchant.slug} merchantName={merchant.name} presets={presets} />;
}
