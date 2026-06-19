import { ApiDoc, ApiTags, Controller, Post } from '@tsuki-hono/common';
import { injectable } from 'tsyringe';

import type { RedisProvider } from '../../redis/redis.provider';
import type { EventsService } from './events.service';

@Controller('events')
@ApiTags('events')
@injectable()
export class EventsController {
  constructor(
    private readonly events: EventsService,
    private readonly redis: RedisProvider,
  ) {}

  @Post('/ping')
  @ApiDoc({ summary: 'Emit a ping event' })
  async ping() {
    await this.events.ping('http-controller');
    return { emitted: 'ping' };
  }

  @Post('/stats')
  @ApiDoc({ summary: 'Read aggregate counters maintained by the listener' })
  async stats() {
    const client = this.redis.get();
    const [posts, pings] = await client.mget('stats:posts_created', 'stats:pings');
    return {
      postsCreated: Number(posts ?? 0),
      pings: Number(pings ?? 0),
    };
  }
}
