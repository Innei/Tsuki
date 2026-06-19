import { Module } from '@tsuki-hono/common';
import { EventModule } from '@tsuki-hono/event-emitter';

import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../redis/redis.module';
import { RedisProvider } from '../redis/redis.provider';
import { CacheModule } from './cache/cache.module';
import { EventsModule } from './events/events.module';
import { HelloModule } from './hello/hello.module';
import { PostsModule } from './posts/posts.module';

function createEventModuleOptions(redis: RedisProvider) {
  return { redisClient: redis.get() };
}

@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    EventModule.forRootAsync({
      useFactory: createEventModuleOptions,
      inject: [RedisProvider],
    }),
    HelloModule,
    PostsModule,
    CacheModule,
    EventsModule,
  ],
})
export class AppModules {}
