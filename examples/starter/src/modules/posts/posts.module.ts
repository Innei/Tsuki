import { Module } from '@tsuki-hono/common';

import { DatabaseModule } from '../../database/database.module';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

@Module({
  imports: [DatabaseModule],
  controllers: [PostsController],
  providers: [PostsService],
})
export class PostsModule {}
