import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

type DB = ReturnType<typeof drizzle<typeof schema>>;
let _db: DB | null = null;

export function getDb(): DB {
  if (!_db) {
    _db = drizzle(neon(process.env.DATABASE_URL!), { schema });
  }
  return _db;
}
