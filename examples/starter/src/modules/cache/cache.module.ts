import { Module } from '@tsuki-hono/common';

import { RedisModule } from '../../redis/redis.module';
import { CacheController } from './cache.controller';

@Module({
  imports: [RedisModule],
  controllers: [CacheController],
})
export class CacheModule {}
