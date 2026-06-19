import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createLogger } from '@tsuki-hono/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

import { env } from './env';

const LOCK_KEY = 0x7375_6B69;
const logger = createLogger('Migrate');

const MIGRATIONS_FOLDER =
  process.env.MIGRATIONS_DIR ??
  path.resolve(fileURLToPath(new URL('.', import.meta.url)), 'drizzle');

async function withAdvisoryLock<T>(pool: pg.Pool, run: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    try {
      return await run();
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

async function main() {
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 2 });
  const db = drizzle(pool);

  logger.info(`using folder ${MIGRATIONS_FOLDER}`);
  logger.info(`acquiring advisory lock ${LOCK_KEY}…`);

  await withAdvisoryLock(pool, async () => {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    logger.info('schema is up to date');
  });

  await pool.end();
}

main().catch((error) => {
  logger.error('migration failed:', error);
  process.exit(1);
});
