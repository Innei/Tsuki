import type { OnModuleDestroy, OnModuleInit } from '@tsuki-hono/common';
import { createLogger } from '@tsuki-hono/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { injectable } from 'tsyringe';

import { env } from '../env';
import * as schema from './schema';

const logger = createLogger('DB');

export type AppDatabase = NodePgDatabase<typeof schema>;

@injectable()
export class DatabaseProvider implements OnModuleInit, OnModuleDestroy {
  private pool?: pg.Pool;
  private dbInstance?: AppDatabase;

  async onModuleInit(): Promise<void> {
    this.pool = new pg.Pool({
      connectionString: env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    this.pool.on('error', (error) => {
      logger.error(`Idle client error: ${error.message}`);
    });

    const client = await this.pool.connect();
    try {
      await client.query('SELECT 1');
      logger.info('Postgres connection ready');
    } finally {
      client.release();
    }

    this.dbInstance = drizzle(this.pool, { schema });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
    logger.info('Postgres pool closed');
  }

  get db(): AppDatabase {
    if (!this.dbInstance) {
      throw new Error('DatabaseProvider not initialized. Did onModuleInit run?');
    }
    return this.dbInstance;
  }
}
