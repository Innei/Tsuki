import { describe, expect, it, vi } from 'vitest';

import { CacheController } from '../src/modules/cache/cache.controller';
import type { RedisProvider } from '../src/redis/redis.provider';

vi.mock('../src/redis/redis.provider', () => ({ RedisProvider: class {} }));

describe('cache Redis isolation', () => {
  it('keeps reads and writes away from other application keys and preserves cache TTL', async () => {
    const entries = new Map([
      ['stats:pings', '7'],
      ['session:user', 'private-session'],
    ]);
    const client = {
      get: vi.fn(async (key: string) => entries.get(key) ?? null),
      set: vi.fn(async (key: string, value: string, ..._ttl: unknown[]) => {
        entries.set(key, value);
        return 'OK';
      }),
    };
    const controller = new CacheController({ get: () => client } as unknown as RedisProvider);

    await expect(controller.read('session:user')).rejects.toMatchObject({
      code: 'CACHE_KEY_NOT_FOUND',
    });
    await controller.write('stats:pings', { value: 'not-a-counter', ttlSeconds: 60 });
    expect(entries.get('stats:pings')).toBe('7');
    expect(client.set).toHaveBeenCalledWith('cache:stats:pings', 'not-a-counter', 'EX', 60);
    await expect(controller.read('stats:pings')).resolves.toEqual({
      key: 'stats:pings',
      value: 'not-a-counter',
    });

    await controller.write('greeting', { value: 'hi' });
    expect(client.set).toHaveBeenCalledWith('cache:greeting', 'hi');
    await expect(controller.read('greeting')).resolves.toEqual({ key: 'greeting', value: 'hi' });
  });
});
