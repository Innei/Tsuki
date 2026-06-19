import { Module } from '@tsuki-hono/common';

import { DatabaseProvider } from './database.provider';

@Module({
  providers: [DatabaseProvider],
})
export class DatabaseModule {}
