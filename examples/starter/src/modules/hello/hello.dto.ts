import { createZodDto } from '@tsuki-hono/common';
import { z } from 'zod';

export const helloQuerySchema = z.object({
  name: z.string().min(1).max(50).default('world'),
});

export class HelloQueryDto extends createZodDto(helloQuerySchema) {}

export const greetBodySchema = z.object({
  name: z.string().min(1).max(50),
  excited: z.boolean().optional().default(false),
});

export class GreetBodyDto extends createZodDto(greetBodySchema) {}
