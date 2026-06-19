import type { OnModuleDestroy, OnModuleInit } from '@tsuki-hono/common';
import { createLogger } from '@tsuki-hono/common';
import Redis from 'ioredis';
import { injectable } from 'tsyringe';

import { env } from '../env';

const logger = createLogger('Redis');

@injectable()
export class RedisProvider implements OnModuleInit, OnModuleDestroy {
  private client?: Redis;

  async onModuleInit(): Promise<void> {
    this.client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });

    this.client.on('error', (error) => {
      logger.error(`Connection error: ${error.message}`);
    });

    await this.client.ping();
    logger.info('Redis connection ready');
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit();
    logger.info('Redis connection closed');
  }

  get(): Redis {
    if (!this.client) {
      throw new Error('RedisProvider not initialized. Did onModuleInit run?');
    }
    return this.client;
  }
}
