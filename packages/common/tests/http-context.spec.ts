import { setTimeout } from 'node:timers/promises';

import { Context } from 'hono';
import { describe, expect, it } from 'vitest';

import { HttpContext } from '../src';

const createContext = () => new Context(new Request('http://localhost'));

describe('HttpContext', () => {
  it('returns promises for synchronous and asynchronous callbacks', async () => {
    const context = createContext();
    const result = HttpContext.run(context, () => {
      expect(HttpContext.getValue('hono')).toBe(context);
      return 'sync';
    });

    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBe('sync');
    await expect(HttpContext.run(context, async () => 'async')).resolves.toBe('async');
    expect(() => HttpContext.get()).toThrow(/not available/);
  });

  it('rejects synchronous and asynchronous callback errors and restores the outer context', async () => {
    const outer = createContext();
    const inner = createContext();
    const error = new Error('callback failed');

    await HttpContext.run(outer, async () => {
      await expect(
        HttpContext.run(inner, () => {
          throw error;
        }),
      ).rejects.toBe(error);
      expect(HttpContext.getValue('hono')).toBe(outer);
      await expect(
        HttpContext.run(inner, async () => {
          await setTimeout(1);
          throw error;
        }),
      ).rejects.toBe(error);
      expect(HttpContext.getValue('hono')).toBe(outer);
    });

    expect(() => HttpContext.get()).toThrow(/not available/);
  });

  it('keeps overlapping asynchronous requests isolated and restores nested contexts', async () => {
    const contexts = [createContext(), createContext()];

    await Promise.all(
      contexts.map((context, index) =>
        HttpContext.run(context, async () => {
          await setTimeout(index + 1);
          expect(HttpContext.getValue('hono')).toBe(context);

          const nested = createContext();
          await HttpContext.run(nested, async () => {
            await setTimeout(2 - index);
            expect(HttpContext.getValue('hono')).toBe(nested);
          });

          expect(HttpContext.getValue('hono')).toBe(context);
          await setTimeout(1);
          expect(HttpContext.getValue('hono')).toBe(context);
        }),
      ),
    );

    expect(() => HttpContext.get()).toThrow(/not available/);
  });
});
