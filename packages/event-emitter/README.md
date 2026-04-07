# @tsuki/event-emitter

Redis pub/sub event system for the Tsuki framework — decorator-based event listeners and emitters with cross-process broadcasting.

## Install

```bash
pnpm add @tsuki/event-emitter
```

Peer dependency: `ioredis >= 5.8.0`

## Setup

Import `EventModule.forRootAsync()` in your root module:

```ts
import { Module } from '@tsuki/common';
import { EventModule } from '@tsuki/event-emitter';
import { RedisService } from './redis.service';

@Module({
  imports: [
    EventModule.forRootAsync({
      useFactory: (redis: RedisService) => ({
        redisClient: redis.getClient(),
        channel: 'my-app:events', // optional, defaults to 'tsuki:events'
      }),
      inject: [RedisService],
    }),
  ],
})
export class AppModule {}
```

## Usage

### Listen to Events

```ts
import { injectable } from 'tsyringe';
import { OnEvent } from '@tsuki/event-emitter';

@injectable()
export class NotificationListener {
  @OnEvent('user.created')
  async onUserCreated(payload: { userId: string }) {
    await sendWelcomeEmail(payload.userId);
  }

  @OnEvent('order.completed')
  async onOrderCompleted(payload: { orderId: string }) {
    await generateInvoice(payload.orderId);
  }
}
```

### Emit Events

#### Decorator-based (automatic)

```ts
import { EmitEvent } from '@tsuki/event-emitter';

@injectable()
export class UserService {
  @EmitEvent('user.created')
  async createUser(data: CreateUserInput) {
    const user = await this.db.insert(data);
    return user; // return value is emitted as the event payload
  }

  // Custom payload selector
  @EmitEvent('user.updated', {
    selector: (args, result) => ({ userId: result.id, changes: args[1] }),
  })
  async updateUser(id: string, changes: Partial<User>) {
    return await this.db.update(id, changes);
  }
}
```

#### Manual

```ts
import { EventEmitterService } from '@tsuki/event-emitter';

@injectable()
export class OrderService {
  constructor(private readonly events: EventEmitterService) {}

  async placeOrder(order: Order) {
    await this.db.save(order);
    await this.events.emit('order.completed', { orderId: order.id });
  }
}
```

### Type-Safe Events

Augment the `Events` interface for full type safety:

```ts
declare module '@tsuki/event-emitter' {
  interface Events {
    'user.created': { userId: string };
    'order.completed': { orderId: string; total: number };
  }
}
```

### Manual Subscriptions

```ts
const emitter = container.resolve(EventEmitterService);

const handler = (payload) => console.log('received', payload);
emitter.on('my.event', handler);
emitter.off('my.event', handler);
```

## How It Works

- **Local dispatch**: Events are dispatched to all in-process listeners immediately
- **Redis broadcast**: Events are published to a Redis channel so other processes receive them too
- **Auto-binding**: `@OnEvent` handlers are discovered and bound automatically when the module starts
- **Error isolation**: A failing handler does not prevent other handlers from executing
- **Lifecycle**: Subscriptions are cleaned up on `onModuleDestroy`

## License

MIT
