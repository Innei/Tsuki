# @tsuki/common

Shared building blocks for the Tsuki framework — decorators, interfaces, exceptions, validation pipes, logger, and request context.

## Install

```bash
pnpm add @tsuki/common
```

Peer dependency: `hono >= 4.0.0`

## What's Included

### Decorators

```ts
import {
  Module,
  forwardRef, // Module system
  Controller, // Route controller
  Get,
  Post,
  Put,
  Patch,
  Delete, // HTTP methods
  Options,
  Head,
  Body,
  Query,
  Param,
  Headers, // Parameter injection
  Req,
  ContextParam,
  UseGuards,
  UsePipes, // Enhancers
  UseInterceptors,
  UseFilters,
  Middleware, // Middleware
  ApiTags,
  ApiDoc, // OpenAPI metadata
  ZodSchema, // Zod schema binding
  applyDecorators, // Compose decorators
} from '@tsuki/common';
```

### Request Context

AsyncLocalStorage-based, request-scoped context — accessible from anywhere in the call stack.

```ts
import { HttpContext } from '@tsuki/common';

// Read
const ctx = HttpContext.getValue('hono');
const path = ctx.req.path;

// Write (extend via module augmentation)
declare module '@tsuki/common' {
  interface HttpContextValues {
    userId?: string;
  }
}
HttpContext.assign({ userId: '123' });
```

### Exceptions

```ts
import {
  HttpException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  InternalServerErrorException,
} from '@tsuki/common';

throw new NotFoundException();
throw new BadRequestException({ message: 'Invalid input' });
```

### Validation (Zod)

```ts
import { z } from 'zod';
import { createZodSchemaDto, createZodValidationPipe, ZodValidationPipe } from '@tsuki/common';

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
});
class CreateUserDto extends createZodSchemaDto(CreateUserSchema) {}

// Use in controller
@Post('/')
create(@Body() dto: CreateUserDto) {
  // dto is validated and typed
}
```

### Logger

```ts
import { createLogger } from '@tsuki/common';

const logger = createLogger('MyService');
logger.info('Hello');
logger.error('Something went wrong');

const childLogger = logger.extend('SubModule');
childLogger.debug('Detailed info');
```

### Interfaces

All type definitions for the framework contract:

- `Constructor`, `Provider`, `ModuleMetadata`
- `CanActivate`, `PipeTransform`, `Interceptor`, `ExceptionFilter`
- `ExecutionContext`, `ArgumentsHost`, `CallHandler`
- `HttpMiddleware`, `MiddlewareDefinition`
- Lifecycle hooks: `OnModuleInit`, `OnModuleDestroy`, `OnApplicationBootstrap`, `BeforeApplicationShutdown`, `OnApplicationShutdown`

### Constants

Metadata symbols and global enhancer tokens:

```ts
import { APP_GUARD, APP_PIPE, APP_INTERCEPTOR, APP_FILTER, APP_MIDDLEWARE } from '@tsuki/common';
```

## License

MIT
