import { Module } from '@tsuki-hono/common';

import { RedisProvider } from './redis.provider';

@Module({
  providers: [RedisProvider],
})
export class RedisModule {}
