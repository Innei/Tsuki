import { AppErrorCode } from './app-error-code';
import type { AppErrorPayloadMap } from './app-error-payload';

type PayloadFor<C extends AppErrorCode> = AppErrorPayloadMap[C];
type PresentPayloadFor<C extends AppErrorCode> = Exclude<PayloadFor<C>, undefined>;

type AppErrorDefinition<C extends AppErrorCode> =
  undefined extends PayloadFor<C>
    ? {
        status: number;
        message: string | ((payload: PresentPayloadFor<C> | undefined) => string);
        details?: (
          payload: PresentPayloadFor<C> | undefined,
        ) => Record<string, unknown> | undefined;
      }
    : {
        status: number;
        message: string | ((payload: PresentPayloadFor<C>) => string);
        details?: (payload: PresentPayloadFor<C>) => Record<string, unknown> | undefined;
      };

export const APP_ERROR_DEFINITIONS: {
  [C in AppErrorCode]: AppErrorDefinition<C>;
} = {
  [AppErrorCode.INTERNAL_ERROR]: {
    status: 500,
    message: (p) => p?.message ?? 'Internal server error',
  },
  [AppErrorCode.HTTP_ERROR]: {
    status: 500,
    message: (p) => p.message,
  },
  [AppErrorCode.VALIDATION_FAILED]: {
    status: 422,
    message: 'Validation failed',
    details: (p) => (p?.issues ? { issues: p.issues } : undefined),
  },
  [AppErrorCode.NOT_FOUND]: {
    status: 404,
    message: (p) => p?.message ?? 'Not found',
    details: (p) => (p?.id ? { id: p.id } : undefined),
  },
  [AppErrorCode.POST_NOT_FOUND]: {
    status: 404,
    message: 'Post not found',
    details: (p) => ({ id: p.id }),
  },
  [AppErrorCode.CACHE_KEY_NOT_FOUND]: {
    status: 404,
    message: 'Cache key not found',
    details: (p) => ({ key: p.key }),
  },
};
