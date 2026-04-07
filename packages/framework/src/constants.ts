export const MODULE_METADATA = Symbol('MODULE_METADATA')
export const CONTROLLER_METADATA = Symbol('CONTROLLER_METADATA')
export const ROUTES_METADATA = Symbol('ROUTES_METADATA')
export const GUARDS_METADATA = Symbol('GUARDS_METADATA')
export const PIPES_METADATA = Symbol('PIPES_METADATA')
export const INTERCEPTORS_METADATA = Symbol('INTERCEPTORS_METADATA')
export const EXCEPTION_FILTERS_METADATA = Symbol('EXCEPTION_FILTERS_METADATA')
export const MIDDLEWARE_METADATA = Symbol('MIDDLEWARE_METADATA')

export const ROUTE_ARGS_METADATA = Symbol('ROUTE_ARGS_METADATA')

export function isDebugEnabled(): boolean {
  return process.env.DEBUG === 'true'
}
export const API_TAGS_METADATA = Symbol('API_TAGS_METADATA')
export const API_OPERATION_METADATA = Symbol('API_OPERATION_METADATA')

// Global enhancer provider tokens (NestJS-like)
export const APP_GUARD = Symbol('APP_GUARD')
export const APP_PIPE = Symbol('APP_PIPE')
export const APP_INTERCEPTOR = Symbol('APP_INTERCEPTOR')
export const APP_FILTER = Symbol('APP_FILTER')
export const APP_MIDDLEWARE = Symbol('APP_MIDDLEWARE')
