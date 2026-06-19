import { createZodDto } from '@tsuki-hono/common';
import { z } from 'zod';

export const createPostSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().max(10_000).default(''),
});

export class CreatePostDto extends createZodDto(createPostSchema) {}
