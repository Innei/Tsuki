import { createLogger } from '@tsuki-hono/common';
import { OnEvent } from '@tsuki-hono/event-emitter';
import { injectable } from 'tsyringe';

import type { Post } from '../../database/schema';
import type { RedisProvider } from '../../redis/redis.provider';

const logger = createLogger('Events');

@injectable()
export class EventsListener {
  constructor(private readonly redis: RedisProvider) {}

  @OnEvent('post.created')
  async onPostCreated(post: Post): Promise<void> {
    logger.info(`Post created: #${post.id} "${post.title}"`);
    await this.redis.get().incr('stats:posts_created');
  }

  @OnEvent('ping')
  async onPing(payload: { from: string; at: string }): Promise<void> {
    logger.info(`Ping from ${payload.from} at ${payload.at}`);
    await this.redis.get().incr('stats:pings');
  }
}
