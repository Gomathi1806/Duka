// Official MiniPay deeplinks — https://docs.minipay.xyz/technical-references/deeplinks.html
// Pure string builders, safe on server and client.

/**
 * Wrap a URL so scanning the QR with any camera app opens it inside
 * MiniPay's in-app browser (where the wallet is injected), instead of a
 * regular browser with no wallet.
 */
export function miniPayBrowseUrl(url: string): string {
  return `https://link.minipay.xyz/browse?url=${encodeURIComponent(url)}`;
}

/** Native MiniPay receipt screen for a transaction, with confetti. */
export function miniPayReceiptUrl(txHash: string, celebrate = true): string {
  return `https://link.minipay.xyz/receipt?tx=${txHash}${celebrate ? '&celebrate' : ''}`;
}
