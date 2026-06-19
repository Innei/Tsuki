import { ApiDoc, ApiTags, Body, Controller, Get, Param, Put } from '@tsuki-hono/common';
import { z } from 'zod';

import { createAppException } from '../../common/errors/app-error.factory';
import { AppErrorCode } from '../../common/errors/app-error-code';
import { RedisProvider } from '../../redis/redis.provider';

const setBodySchema = z.object({
  value: z.string().max(10_000),
  ttlSeconds: z.coerce.number().int().positive().max(86_400).optional(),
});

@Controller('cache')
@ApiTags('cache')
export class CacheController {
  constructor(private readonly redis: RedisProvider) {}

  @Get('/:key')
  @ApiDoc({ summary: 'Read a cache entry' })
  async read(@Param('key') key: string) {
    const value = await this.redis.get().get(key);
    if (value === null) {
      throw createAppException(AppErrorCode.CACHE_KEY_NOT_FOUND, { key });
    }
    return { key, value };
  }

  @Put('/:key')
  @ApiDoc({ summary: 'Set a cache entry' })
  async write(@Param('key') key: string, @Body() raw: unknown) {
    const body = setBodySchema.parse(raw);
    const client = this.redis.get();

    if (body.ttlSeconds) {
      await client.set(key, body.value, 'EX', body.ttlSeconds);
    } else {
      await client.set(key, body.value);
    }

    return { key, value: body.value, ttlSeconds: body.ttlSeconds ?? null };
  }
}
