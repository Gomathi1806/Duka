'use client';

import { useEffect, useState } from 'react';
import QR from 'qrcode';

export default function QRCode({ value, size = 260 }: { value: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState('');

  useEffect(() => {
    if (!value) return;
    QR.toDataURL(value, {
      width: size * 2, // 2x for retina
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#0a0a0c', light: '#ffffff' },
    })
      .then(setDataUrl)
      .catch((e) => console.error('[QRCode] generation failed:', e));
  }, [value, size]);

  if (!dataUrl) {
    return (
      <div
        style={{ width: size, height: size, borderRadius: 16, background: 'rgba(255,255,255,0.06)' }}
      />
    );
  }

  return (
    <img
      src={dataUrl}
      alt={`QR code for ${value}`}
      width={size}
      height={size}
      style={{ borderRadius: 16, display: 'block' }}
    />
  );
}
