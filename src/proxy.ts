import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Next.js 16: proxy.ts replaces middleware.ts
export function proxy(_req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
};
