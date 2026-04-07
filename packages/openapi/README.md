# @tsuki/openapi

OpenAPI 3.1 document generation for the Tsuki framework — automatically builds specs from module, controller, and decorator metadata.

## Install

```bash
pnpm add @tsuki/openapi
```

## Usage

```ts
import { createOpenApiDocument } from '@tsuki/openapi';
import { AppModule } from './app.module';

const doc = createOpenApiDocument(AppModule, {
  title: 'My API',
  version: '1.0.0',
  description: 'API documentation',
  globalPrefix: '/api',
  servers: [{ url: 'https://api.example.com' }],
});

// Serve as JSON endpoint
@Controller('docs')
class DocsController {
  @Get('/openapi.json')
  getSpec() {
    return doc;
  }
}
```

## What Gets Collected

The generator traverses the module graph and collects:

- **Paths & methods** from `@Controller` prefix + `@Get/@Post/...` routes
- **Parameters** from `@Param`, `@Query`, `@Headers` decorators (mapped to path/query/header)
- **Request bodies** from `@Body` decorators
- **Schemas** from Zod DTOs (via `createZodSchemaDto`) — converted to JSON Schema and placed in `components/schemas`
- **Tags** from `@ApiTags` (class/method level)
- **Operation metadata** from `@ApiDoc({ summary, description, operationId, deprecated, externalDocs, tags })`
- **Module topology** exposed as `x-modules` extension

## Annotating Your API

```ts
import { Controller, Get, Post, Body, Param, ApiTags, ApiDoc } from '@tsuki/common';

@ApiTags('Users')
@Controller('users')
class UserController {
  @Get('/')
  @ApiDoc({ summary: 'List all users' })
  listUsers() {}

  @Get('/:id')
  @ApiDoc({ summary: 'Get user by ID', deprecated: true })
  getUser(@Param('id') id: string) {}

  @Post('/')
  @ApiDoc({
    summary: 'Create a new user',
    description: 'Registers a user and sends a welcome email',
    tags: ['Admin'],
  })
  createUser(@Body() dto: CreateUserDto) {}
}
```

## Zod Schema Conversion

Zod types are automatically converted to JSON Schema:

| Zod Type              | JSON Schema                                    |
| --------------------- | ---------------------------------------------- |
| `z.string()`          | `{ type: "string" }`                           |
| `z.string().email()`  | `{ type: "string", format: "email" }`          |
| `z.number().int()`    | `{ type: "integer" }`                          |
| `z.boolean()`         | `{ type: "boolean" }`                          |
| `z.array(z.string())` | `{ type: "array", items: { type: "string" } }` |
| `z.object({ ... })`   | `{ type: "object", properties: { ... } }`      |
| `z.enum(['a', 'b'])`  | `{ type: "string", enum: ["a", "b"] }`         |
| `z.union([...])`      | `{ oneOf: [...] }`                             |
| `z.optional(...)`     | marks field as not required                    |
| `z.nullable(...)`     | adds `nullable: true`                          |

## Output

Returns a fully compliant `OpenApiDocument` (3.1.0) with:

- `info` — title, version, description
- `servers` — server URLs
- `tags` — auto-generated from modules, controllers, and `@ApiTags`
- `paths` — all routes with parameters, request bodies, and responses
- `components.schemas` — reusable Zod-derived schemas
- `x-modules` — module hierarchy tree

## License

MIT
