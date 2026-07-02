import { pgTable, text, timestamp, decimal, uuid } from 'drizzle-orm/pg-core';

export const merchants = pgTable('merchants', {
  id: uuid('id').primaryKey().defaultRandom(),
  walletAddress: text('wallet_address').notNull().unique(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  // Comma-separated preset amounts shown on the pay page, e.g. "1,2,5,10"
  presetAmounts: text('preset_amounts').default(''),
  token: text('token').notNull().default('cUSD'), // cUSD (USDm) | USDC | cEUR | cREAL
  createdAt: timestamp('created_at').defaultNow(),
});

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  merchantId: uuid('merchant_id').notNull().references(() => merchants.id),
  payerAddress: text('payer_address').notNull(),
  txHash: text('tx_hash').notNull().unique(),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  token: text('token').notNull().default('cUSD'),
  createdAt: timestamp('created_at').defaultNow(),
});

export type Merchant = typeof merchants.$inferSelect;
export type NewMerchant = typeof merchants.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
