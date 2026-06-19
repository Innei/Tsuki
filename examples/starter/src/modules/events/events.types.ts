import type { Post } from '../../database/schema';

declare module '@tsuki-hono/event-emitter' {
  interface Events {
    'ping': { from: string; at: string };
    'post.created': Post;
  }
}

export {};
