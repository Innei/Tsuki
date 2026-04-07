import { injectable } from 'tsyringe';

import { Module } from '../decorators/module';
import type { Constructor, OnModuleDestroy, OnModuleInit } from '../interfaces';
import { createLogger } from '../logger';
import { ContainerRef } from '../utils/container-ref';

const logger = createLogger('Events:EmitDecorator');

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

// Minimal Redis client interface used by the module
export type RedisClient = {
  publish: (...args: any[]) => any;
  duplicate: () => RedisClient;
  subscribe: (...args: any[]) => any;
  unsubscribe: (...args: any[]) => any;
  quit: () => any;
  on: (event: string, listener: (...args: any[]) => void) => any;
};

// Metadata keys
const EVENT_LISTENER_METADATA = Symbol.for('events.listener');
const EVENT_EMIT_DECORATOR = Symbol.for('events.emit');

// Track classes that declare @OnEvent handlers
const GLOBAL_EVENT_LISTENER_CLASSES = new Set<Constructor>();

// Types
export interface EventMessage<T = unknown> {
  emittedAt: string;
  event: string;
  payload: T;
}

export type EventHandler<T = unknown> = (payload: T) => Promise<void> | void;

export interface EventModuleOptions {
  channel?: string;
  redisClient: RedisClient;
}

export interface EventModuleAsyncOptions {
  inject?: Constructor[];
  useFactory: (...args: any[]) => Promise<EventModuleOptions> | EventModuleOptions;
}

export interface Events {}

type EventNameInterface = keyof Events | (string & {});

export type InferEventPayload<T extends EventNameInterface> = T extends keyof Events
  ? Events[T]
  : unknown;

// Decorators
export function OnEvent(eventName: EventNameInterface): MethodDecorator {
  return (target, propertyKey) => {
    const ctor = (target as any).constructor as Constructor;
    const existing: Array<{ method: string | symbol; event: string }> =
      (Reflect.getMetadata(EVENT_LISTENER_METADATA, ctor) as any) || [];

    Reflect.defineMetadata(
      EVENT_LISTENER_METADATA,
      [...existing, { method: propertyKey!, event: eventName }],
      ctor,
    );
    GLOBAL_EVENT_LISTENER_CLASSES.add(ctor);
  };
}

export interface EmitEventOptions {
  selector?: (args: any[], result: any) => any;
}

export function EmitEvent(
  eventName: EventNameInterface,
  options?: EmitEventOptions,
): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    const original = descriptor.value as (...args: any[]) => any;
    if (typeof original !== 'function') return descriptor!;

    Reflect.defineMetadata(EVENT_EMIT_DECORATOR, { eventName }, target, propertyKey!);

    const wrapped = function (this: any, ...args: any[]) {
      const maybePromise = original.apply(this, args);
      const onFulfilled = async (result: any) => {
        try {
          const container = ContainerRef.get();
          const emitter = container.resolve(EventEmitterService);
          const payload = options?.selector ? options.selector(args, result) : result;
          await emitter.emit(eventName, payload);
        } catch (error) {
          logger.error(`Failed to emit event ${eventName} (async): ${formatError(error)}`);
        }
        return result;
      };

      if (maybePromise && typeof (maybePromise as any).then === 'function') {
        return (maybePromise as Promise<any>).then(onFulfilled);
      }

      try {
        const container = ContainerRef.get();
        const emitter = container.resolve(EventEmitterService);
        const payload = options?.selector ? options.selector(args, maybePromise) : maybePromise;

        Promise.resolve()
          .then(() => emitter.emit(eventName, payload))
          .catch((error) => {
            logger.error(`Failed to emit event ${eventName} (sync): ${formatError(error)}`);
          });
      } catch (error) {
        const logger = createLogger('Events:EmitDecorator');
        logger.error(`Failed to setup event emission for ${eventName}: ${formatError(error)}`);
      }
      return maybePromise;
    };

    return { ...descriptor!, value: wrapped as any } as PropertyDescriptor;
  };
}

@injectable()
export class EventEmitterService implements OnModuleDestroy {
  private publisher?: RedisClient;
  private subscriber?: RedisClient;
  private channel = 'tsuki:events';
  private started = false;
  private readonly logger = createLogger('Events');

  // Local registry
  private readonly listeners = new Map<string, Set<EventHandler>>();
  private readonly boundHandlers = new WeakMap<object, Map<string | symbol, EventHandler>>();

  constructor() {}

  async start(options: EventModuleOptions): Promise<void> {
    if (this.started) return;
    this.publisher = options.redisClient;
    this.channel = options.channel ?? 'tsuki:events';
    this.subscriber = options.redisClient.duplicate();

    const onMessage = async (_channel: string, message: string) => {
      try {
        const envelope = JSON.parse(message) as EventMessage;
        if (!envelope?.event) return;
        await this.dispatch(envelope.event, envelope.payload);
      } catch (error) {
        this.logger.error(`Failed to process event message: ${formatError(error)}`);
      }
    };

    this.subscriber.on('message', onMessage as any);
    await this.subscriber.subscribe(this.channel);
    await this.bindAllListeners();
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    try {
      if (this.subscriber) {
        try {
          await this.subscriber.unsubscribe(this.channel);
        } catch (error) {
          this.logger.warn(`Failed to unsubscribe from channel: ${formatError(error)}`);
        }
        try {
          await this.subscriber.quit();
        } catch (error) {
          this.logger.warn(`Failed to quit subscriber: ${formatError(error)}`);
        }
      }
    } finally {
      this.subscriber = undefined;
      this.started = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }

  async emit<T extends EventNameInterface>(event: T, payload: InferEventPayload<T>): Promise<void> {
    const envelope: EventMessage<InferEventPayload<T>> = {
      event,
      payload,
      emittedAt: new Date().toISOString(),
    };

    if (!this.started) {
      throw new Error(
        'EventEmitterService has not been started. Ensure EventModule.forRootAsync() is imported in your root module and the application has finished initialization before emitting events.',
      );
    }

    await this.dispatch(event, payload);

    if (this.publisher) {
      try {
        await this.publisher.publish(this.channel, JSON.stringify(envelope));
      } catch (error) {
        this.logger.error(`Failed to publish event ${event}: ${formatError(error)}`);
      }
    }
  }

  on<T extends EventNameInterface>(event: T, handler: EventHandler<InferEventPayload<T>>): void {
    const set = this.listeners.get(event) ?? new Set<EventHandler>();
    set.add(handler as EventHandler);
    this.listeners.set(event, set);
  }

  off<T extends EventNameInterface>(event: T, handler: EventHandler<InferEventPayload<T>>): void {
    const set = this.listeners.get(event);
    if (!set) return;
    set.delete(handler as EventHandler);
    if (set.size === 0) this.listeners.delete(event);
  }

  private async dispatch<T extends EventNameInterface>(
    event: T,
    payload: InferEventPayload<T>,
  ): Promise<void> {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;
    for (const handler of set) {
      try {
        await Promise.resolve(handler(payload));
      } catch (error) {
        this.logger.error(`Failed to handle event ${event}: ${formatError(error)}`);
      }
    }
  }

  private async bindAllListeners(): Promise<void> {
    const container = ContainerRef.get();
    const containerAny = container as any;
    const reg =
      containerAny.registrations ??
      containerAny._registry ??
      containerAny._registryMap ??
      containerAny._resolvers;
    const keys = reg instanceof Map ? Array.from(reg.keys()) : Object.keys(reg ?? {});

    const scanned: Constructor[] = [];
    for (const token of keys) {
      if (typeof token === 'function' && Reflect.hasMetadata(EVENT_LISTENER_METADATA, token)) {
        scanned.push(token as Constructor);
      }
    }

    const candidates = new Set<Constructor>([...GLOBAL_EVENT_LISTENER_CLASSES, ...scanned]);
    for (const ctor of candidates) {
      let instance: any;
      try {
        instance = container.resolve(ctor as any);
      } catch (error) {
        const ctorName = ctor.name || ctor.toString();
        this.logger.warn(`Failed to resolve event listener ${ctorName}: ${formatError(error)}`);
        continue;
      }

      const entries: Array<{ method: string | symbol; event: string }> =
        (Reflect.getMetadata(EVENT_LISTENER_METADATA, ctor) as any) || [];

      let map = this.boundHandlers.get(instance);
      if (!map) {
        map = new Map<string | symbol, EventHandler>();
        this.boundHandlers.set(instance, map);
      }

      for (const { method, event } of entries) {
        const original = instance[method];
        if (typeof original !== 'function') continue;
        let bound = map.get(method);
        if (!bound) {
          bound = original.bind(instance);
          map.set(method, bound!);
        }
        if (bound) this.on(event, bound as EventHandler);
      }
    }
  }
}

// Module
export const EventModule = {
  forRootAsync: (options: EventModuleAsyncOptions): Constructor => {
    const { useFactory, inject = [] } = options;

    @injectable()
    class EventModuleBootstrapper implements OnModuleInit, OnModuleDestroy {
      private started = false;

      private async start(): Promise<void> {
        if (this.started) return;
        const container = ContainerRef.get();
        const deps = inject.map((token) => container.resolve(token as any));
        const resolved = await Promise.resolve(useFactory(...deps));
        const emitter = container.resolve(EventEmitterService);
        await emitter.start(resolved);
        this.started = true;
      }

      async onModuleInit(): Promise<void> {
        await this.start();
      }

      async onModuleDestroy(): Promise<void> {
        if (!this.started) return;
        const container = ContainerRef.get();
        const emitter = container.resolve(EventEmitterService);
        await emitter.stop();
        this.started = false;
      }
    }

    @Module({ providers: [EventEmitterService, EventModuleBootstrapper] })
    class DynamicEventModule {}

    return DynamicEventModule;
  },
};
