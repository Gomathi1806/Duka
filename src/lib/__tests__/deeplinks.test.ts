import { describe, it, expect } from 'vitest';
import { miniPayBrowseUrl, miniPayReceiptUrl } from '../deeplinks';

describe('MiniPay deeplinks', () => {
  it('wraps a pay URL in the browse deeplink, URL-encoded', () => {
    const wrapped = miniPayBrowseUrl('https://duka.example/pay/shop?amount=5');
    expect(wrapped).toBe(
      'https://link.minipay.xyz/browse?url=https%3A%2F%2Fduka.example%2Fpay%2Fshop%3Famount%3D5'
    );
  });

  it('builds a receipt deeplink with celebration by default', () => {
    const tx = '0x' + 'ab'.repeat(32);
    expect(miniPayReceiptUrl(tx)).toBe(`https://link.minipay.xyz/receipt?tx=${tx}&celebrate`);
    expect(miniPayReceiptUrl(tx, false)).toBe(`https://link.minipay.xyz/receipt?tx=${tx}`);
  });
});
