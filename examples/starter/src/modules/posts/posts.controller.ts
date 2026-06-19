import { ApiDoc, ApiTags, Body, Controller, Get, Param, Post } from '@tsuki-hono/common';
import { z } from 'zod';

import { createAppException } from '../../common/errors/app-error.factory';
import { AppErrorCode } from '../../common/errors/app-error-code';
import { withMeta } from '../../common/response/envelope.types';
import { CreatePostDto } from './posts.dto';
import { PostsService } from './posts.service';

const idParamSchema = z.coerce.number().int().positive();

@Controller('posts')
@ApiTags('posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Get('/')
  @ApiDoc({ summary: 'List recent posts' })
  async list() {
    const rows = await this.posts.list();
    return withMeta(rows, { total: rows.length, page: 1, pageSize: rows.length });
  }

  @Get('/:id')
  @ApiDoc({ summary: 'Get a post by id' })
  async getOne(@Param('id') rawId: string) {
    const id = idParamSchema.parse(rawId);
    const post = await this.posts.getById(id);
    if (!post) {
      throw createAppException(AppErrorCode.POST_NOT_FOUND, { id });
    }
    return post;
  }

  @Post('/')
  @ApiDoc({ summary: 'Create a new post' })
  create(@Body() body: CreatePostDto) {
    return this.posts.create(body);
  }
}
