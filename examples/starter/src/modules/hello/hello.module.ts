import { Module } from '@tsuki-hono/common';

import { HelloController } from './hello.controller';

@Module({
  controllers: [HelloController],
})
export class HelloModule {}
