import { MIDDLEWARE_METADATA } from '../constants'
import type { MiddlewareMetadata } from '../interfaces'

export type MiddlewareDecoratorOptions = MiddlewareMetadata

export function Middleware(options: MiddlewareDecoratorOptions = {}): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(MIDDLEWARE_METADATA, options, target)
  }
}

export function getMiddlewareMetadata(target: Function): MiddlewareMetadata {
  return (Reflect.getMetadata(MIDDLEWARE_METADATA, target) as MiddlewareMetadata | undefined) ?? {}
}
