import './events.types';

import { Module } from '@tsuki-hono/common';

import { RedisModule } from '../../redis/redis.module';
import { EventsController } from './events.controller';
import { EventsListener } from './events.listener';
import { EventsService } from './events.service';

@Module({
  imports: [RedisModule],
  controllers: [EventsController],
  providers: [EventsService, EventsListener],
})
export class EventsModule {}
