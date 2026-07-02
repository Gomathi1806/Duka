import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Duka — turn any shop into a digital till',
  description:
    'QR point-of-sale for small merchants. Customers scan with MiniPay and pay in USDm — funds go straight to your wallet on Celo.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
