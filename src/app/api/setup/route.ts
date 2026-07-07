import { neon } from '@neondatabase/serverless';
import { NextResponse } from 'next/server';

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'DATABASE_URL not set' }, { status: 500 });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);

    await sql`
      CREATE TABLE IF NOT EXISTS merchants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_address TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        preset_amounts TEXT DEFAULT '',
        token TEXT NOT NULL DEFAULT 'cUSD',
        created_at TIMESTAMP DEFAULT now()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        merchant_id UUID NOT NULL REFERENCES merchants(id),
        payer_address TEXT NOT NULL,
        tx_hash TEXT NOT NULL UNIQUE,
        amount DECIMAL(10, 2) NOT NULL,
        token TEXT NOT NULL DEFAULT 'cUSD',
        created_at TIMESTAMP DEFAULT now()
      )
    `;

    return NextResponse.json({ ok: true, message: 'Tables created successfully.' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
