import { EmitEvent } from '@tsuki-hono/event-emitter';
import { desc, eq } from 'drizzle-orm';
import { injectable } from 'tsyringe';

import type { DatabaseProvider } from '../../database/database.provider';
import { type NewPost, type Post, posts } from '../../database/schema';

@injectable()
export class PostsService {
  constructor(private readonly database: DatabaseProvider) {}

  async list(): Promise<Post[]> {
    return this.database.db.select().from(posts).orderBy(desc(posts.createdAt)).limit(50);
  }

  async getById(id: number): Promise<Post | undefined> {
    const [row] = await this.database.db.select().from(posts).where(eq(posts.id, id)).limit(1);
    return row;
  }

  @EmitEvent('post.created')
  async create(input: NewPost): Promise<Post> {
    const [row] = await this.database.db.insert(posts).values(input).returning();
    return row;
  }
}
