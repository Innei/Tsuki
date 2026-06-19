import { ApiDoc, ApiTags, Body, Controller, Get, Post, Query } from '@tsuki-hono/common';

import type { GreetBodyDto, HelloQueryDto } from './hello.dto';

@Controller('hello')
@ApiTags('hello')
export class HelloController {
  @Get('/')
  @ApiDoc({ summary: 'Say hello via query string' })
  greet(@Query() query: HelloQueryDto) {
    return { message: `Hello, ${query.name}!` };
  }

  @Post('/')
  @ApiDoc({ summary: 'Say hello via JSON body' })
  greetBody(@Body() body: GreetBodyDto) {
    const suffix = body.excited ? '!!!' : '.';
    return { message: `Hello, ${body.name}${suffix}` };
  }
}
