import type { Context, Next } from 'hono'
import type { DependencyContainer } from 'tsyringe'

import type { HttpContextValues } from '../context/http-context'

export type Constructor<T = any> = new (...args: any[]) => T

export interface FrameworkResponse<T = unknown> extends Response {
  json: () => Promise<T>
}

export interface ForwardReference<T = unknown> {
  forwardRef: () => Constructor<T>
}

export type ModuleImport = Constructor | ForwardReference

export type Token<T = any> = Constructor<T> | symbol | string

export interface ClassProvider<T = any> {
  provide: Token<T>
  useClass: Constructor<T>
  singleton?: boolean
}

export interface ExistingProvider<T = any> {
  provide: Token<T>
  useExisting: Token<T>
}

export interface ValueProvider<T = any> {
  provide: Token<T>
  useValue: T
}

export interface FactoryProvider<T = any> {
  provide: Token<T>
  useFactory: (...args: any[]) => T
  inject?: Token[]
  singleton?: boolean
}

export type Provider = Constructor | ClassProvider | ExistingProvider | ValueProvider | FactoryProvider

export interface ModuleMetadata {
  controllers?: Constructor[]
  providers?: Provider[]
  imports?: ModuleImport[]
}

export interface CanActivate {
  canActivate: (context: ExecutionContext) => Promise<boolean> | boolean
}

export interface PipeTransform<T = unknown, R = T> {
  transform: (value: T, metadata: ArgumentMetadata) => Promise<R> | R
}

export interface ArgumentMetadata {
  type: 'body' | 'query' | 'param' | 'context' | 'custom' | 'headers' | 'request'
  data?: string
  metatype?: Constructor
}

export interface CallHandler<T = unknown> {
  handle: () => Promise<FrameworkResponse<T>>
}

export interface Interceptor<T = unknown> {
  intercept: (context: ExecutionContext, next: CallHandler<T>) => Promise<FrameworkResponse<T>> | FrameworkResponse<T>
}

export interface ExceptionFilter<T = Error> {
  catch: (exception: T, host: ArgumentsHost) => Promise<unknown> | unknown
}

export interface HttpMiddleware {
  use: (context: Context, next: Next) => Promise<Response | void> | Response | void
}

export type MiddlewarePath = string | RegExp | Array<string | RegExp>

export interface MiddlewareMetadata {
  path?: MiddlewarePath
  priority?: number
}

export interface MiddlewareDefinition extends MiddlewareMetadata {
  handler: HttpMiddleware
}

export interface ExecutionContext {
  readonly container: DependencyContainer
  getClass: <T = Constructor>() => T
  getHandler: () => Function
  getContext: <T = HttpContextValues>() => T
  switchToHttp: () => HttpArgumentsHost
}

export interface HttpArgumentsHost {
  getContext: <T = HttpContextValues>() => T
}

export interface ArgumentsHost {
  switchToHttp: () => HttpArgumentsHost
  getContext: <T = HttpContextValues>() => T
}

export interface OnModuleInit {
  onModuleInit: () => Promise<void> | void
}

export interface OnModuleDestroy {
  onModuleDestroy: () => Promise<void> | void
}

export interface OnApplicationBootstrap {
  onApplicationBootstrap: () => Promise<void> | void
}

export interface BeforeApplicationShutdown {
  beforeApplicationShutdown: (signal?: string) => Promise<void> | void
}

export interface OnApplicationShutdown {
  onApplicationShutdown: (signal?: string) => Promise<void> | void
}

export interface GlobalEnhancerRegistry {
  guards: CanActivate[]
  pipes: PipeTransform[]
  interceptors: Interceptor[]
  filters: ExceptionFilter[]
  middlewares: MiddlewareDefinition[]
}

export type RouteDefinition = {
  method: string
  path: string
  handlerName: string | symbol
}

export enum RouteParamtypes {
  CONTEXT = 'context',
  REQUEST = 'request',
  BODY = 'body',
  QUERY = 'query',
  PARAM = 'param',
  HEADERS = 'headers',
  CUSTOM = 'custom',
}

export interface RouteParamMetadataItem {
  index: number
  type: RouteParamtypes
  data?: string
  pipes?: Array<Constructor<PipeTransform>>
  factory?: (...args: unknown[]) => unknown
  metatype?: Constructor
}
