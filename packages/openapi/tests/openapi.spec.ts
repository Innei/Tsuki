import 'reflect-metadata';

import { Body, Controller, createZodSchemaDto, Get, Module, Post, Query } from '@tsuki-hono/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { OpenApiOperation, OpenApiParameter } from '../src';
import { createOpenApiDocument } from '../src';

function buildDocFromController(ControllerClass: any) {
  @Module({ controllers: [ControllerClass] })
  class TestModule {}

  return createOpenApiDocument(TestModule, { title: 'test', version: '0.0.0' });
}

function getOperation(doc: ReturnType<typeof createOpenApiDocument>, path: string, method: string) {
  const operation = doc.paths[path]?.[method];
  if (!operation) {
    throw new Error(`Operation not found at ${method.toUpperCase()} ${path}`);
  }
  return operation as OpenApiOperation;
}

it('matches runtime paths when a controller bypasses the global prefix', () => {
  @Controller({ prefix: 'static', bypassGlobalPrefix: true })
  class StaticController {
    @Get('/asset')
    asset() {}
  }

  @Module({ controllers: [StaticController] })
  class StaticModule {}

  const doc = createOpenApiDocument(StaticModule, {
    title: 'test',
    version: '0.0.0',
    globalPrefix: '/api',
  });

  expect(doc.paths['/static/asset']).toBeDefined();
  expect(doc.paths['/api/static/asset']).toBeUndefined();
});

describe('createOpenApiDocument · Zod 4 schema lowering', () => {
  describe('wrapper unwrapping (lowercase def.type)', () => {
    it('treats optional()/default()/catch() as non-required and preserves nullable', () => {
      class WrapperDto extends createZodSchemaDto(
        z.object({
          required: z.string(),
          optional: z.string().optional(),
          defaulted: z.string().default('x'),
          nullable: z.string().nullable(),
          catchAll: z.string().catch('fallback'),
        }),
        { name: 'WrapperDto' },
      ) {}

      @Controller('wrap')
      class WrapController {
        @Post('/')
        create(@Body() _body: WrapperDto) {
          void _body;
        }
      }

      const doc = buildDocFromController(WrapController);
      const schema = doc.components?.schemas?.WrapperDto as Record<string, any>;

      expect(schema).toBeDefined();
      expect(schema.type).toBe('object');
      expect(schema.required).toEqual(['required', 'nullable']);
      expect(schema.properties.nullable).toMatchObject({ type: 'string', nullable: true });
      expect(schema.properties.optional).toEqual({ type: 'string' });
      expect(schema.properties.defaulted).toEqual({ type: 'string' });
      expect(schema.properties.catchAll).toEqual({ type: 'string' });
    });

    it('passes through pipe()/readonly() wrappers down to the inner type', () => {
      class PassthroughDto extends createZodSchemaDto(
        z.object({
          piped: z.string().pipe(z.string()),
          frozen: z.string().readonly(),
        }),
        { name: 'PassthroughDto' },
      ) {}

      @Controller('pass')
      class PassController {
        @Post('/')
        create(@Body() _body: PassthroughDto) {
          void _body;
        }
      }

      const doc = buildDocFromController(PassController);
      const schema = doc.components?.schemas?.PassthroughDto as Record<string, any>;

      expect(schema).toBeDefined();
      expect(schema.properties.piped).toEqual({ type: 'string' });
      expect(schema.properties.frozen).toEqual({ type: 'string' });
      expect(schema.required).toEqual(['piped', 'frozen']);
    });
  });

  describe('query DTO expansion', () => {
    it('expands a class-level query DTO into per-field parameters', () => {
      class ListQueryDto extends createZodSchemaDto(
        z.object({
          q: z.string(),
          limit: z.number().optional(),
          archived: z.boolean().default(false),
        }),
        { name: 'ListQueryDto' },
      ) {}

      @Controller('items')
      class ItemsController {
        @Get('/')
        list(@Query() _query: ListQueryDto) {
          void _query;
        }
      }

      const doc = buildDocFromController(ItemsController);
      const operation = getOperation(doc, '/items', 'get');
      const parameters = (operation.parameters ?? []) as OpenApiParameter[];

      expect(parameters).toHaveLength(3);

      const byName = Object.fromEntries(parameters.map((p) => [p.name, p]));

      expect(byName.q).toMatchObject({ in: 'query', required: true, schema: { type: 'string' } });
      expect(byName.limit).toMatchObject({ in: 'query', schema: { type: 'number' } });
      expect(byName.limit.required).toBeUndefined();
      expect(byName.archived).toMatchObject({ in: 'query', schema: { type: 'boolean' } });
      expect(byName.archived.required).toBeUndefined();

      expect(doc.components?.schemas?.ListQueryDto).toBeUndefined();
    });

    it('keeps single-key query when @Query("name") targets one field', () => {
      @Controller('search')
      class SearchController {
        @Get('/')
        find(@Query('q') _q: string) {
          void _q;
        }
      }

      const doc = buildDocFromController(SearchController);
      const operation = getOperation(doc, '/search', 'get');
      const parameters = (operation.parameters ?? []) as OpenApiParameter[];

      expect(parameters).toHaveLength(1);
      expect(parameters[0]).toMatchObject({ name: 'q', in: 'query' });
    });
  });

  describe('discriminated union', () => {
    it('emits oneOf with discriminator.propertyName', () => {
      class EventDto extends createZodSchemaDto(
        z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('created'), value: z.string() }),
          z.object({ kind: z.literal('deleted'), count: z.number() }),
        ]),
        { name: 'EventDto' },
      ) {}

      @Controller('events')
      class EventsController {
        @Post('/')
        publish(@Body() _body: EventDto) {
          void _body;
        }
      }

      const doc = buildDocFromController(EventsController);
      const schema = doc.components?.schemas?.EventDto as Record<string, any>;

      expect(schema).toBeDefined();
      expect(schema.discriminator).toEqual({ propertyName: 'kind' });
      expect(Array.isArray(schema.oneOf)).toBe(true);
      expect(schema.oneOf).toHaveLength(2);

      const variants = schema.oneOf as Array<Record<string, any>>;
      const kinds = variants.map((variant) => variant.properties?.kind?.enum?.[0]);
      expect(kinds).toEqual(['created', 'deleted']);
    });
  });

  describe('literal value extraction', () => {
    it('falls back to def.values[0] when def.value is absent (Zod 4)', () => {
      class LiteralDto extends createZodSchemaDto(
        z.object({
          stringLit: z.literal('alpha'),
          numberLit: z.literal(42),
          booleanLit: z.literal(true),
        }),
        { name: 'LiteralDto' },
      ) {}

      @Controller('lit')
      class LitController {
        @Post('/')
        create(@Body() _body: LiteralDto) {
          void _body;
        }
      }

      const doc = buildDocFromController(LitController);
      const schema = doc.components?.schemas?.LiteralDto as Record<string, any>;

      expect(schema).toBeDefined();
      expect(schema.properties.stringLit).toEqual({ type: 'string', enum: ['alpha'] });
      expect(schema.properties.numberLit).toEqual({ type: 'number', enum: [42] });
      expect(schema.properties.booleanLit).toEqual({ type: 'boolean', enum: [true] });
    });
  });

  it('preserves string and number constraints', () => {
    class ConstraintDto extends createZodSchemaDto(
      z.object({
        email: z.string().min(3).max(64).email(),
        code: z.string().length(8),
        count: z.number().min(1).max(10).int(),
        ratio: z.number().gt(0).lt(1),
      }),
      { name: 'ConstraintDto' },
    ) {}

    @Controller('constraints')
    class ConstraintController {
      @Post('/')
      create(@Body() _body: ConstraintDto) {
        void _body;
      }
    }

    const doc = buildDocFromController(ConstraintController);
    const properties = (doc.components?.schemas?.ConstraintDto as any).properties;

    expect(properties.email).toEqual({
      type: 'string',
      minLength: 3,
      maxLength: 64,
      format: 'email',
    });
    expect(properties.code).toEqual({ type: 'string', minLength: 8, maxLength: 8 });
    expect(properties.count).toMatchObject({ type: 'integer', minimum: 1, maximum: 10 });
    expect(properties.ratio).toMatchObject({
      type: 'number',
      exclusiveMinimum: 0,
      exclusiveMaximum: 1,
    });
  });

  it('preserves top-level Zod 4 format constructors', () => {
    class TopLevelFormatDto extends createZodSchemaDto(
      z.object({
        email: z.email(),
        url: z.url(),
        uuid: z.uuid(),
        count: z.int(),
      }),
      { name: 'TopLevelFormatDto' },
    ) {}

    @Controller('top-level-formats')
    class TopLevelFormatController {
      @Post('/')
      create(@Body() _body: TopLevelFormatDto) {
        void _body;
      }
    }

    const doc = buildDocFromController(TopLevelFormatController);
    const properties = (doc.components?.schemas?.TopLevelFormatDto as any).properties;

    expect(properties.email).toEqual({ type: 'string', format: 'email' });
    expect(properties.url).toEqual({ type: 'string', format: 'uri' });
    expect(properties.uuid).toEqual({ type: 'string', format: 'uuid' });
    expect(properties.count).toEqual({ type: 'integer' });
  });
});
