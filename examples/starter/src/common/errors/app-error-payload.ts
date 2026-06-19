import type { AppErrorCode } from './app-error-code';

type OptMessage = { message?: string } | undefined;
type WithId = { id: string | number };
type WithKey = { key: string };

export type AppErrorPayloadMap = {
  [AppErrorCode.INTERNAL_ERROR]: OptMessage;
  [AppErrorCode.HTTP_ERROR]: { message: string };
  [AppErrorCode.VALIDATION_FAILED]: { issues?: unknown } | undefined;
  [AppErrorCode.NOT_FOUND]: { message?: string; id?: string | number } | undefined;

  [AppErrorCode.POST_NOT_FOUND]: WithId;
  [AppErrorCode.CACHE_KEY_NOT_FOUND]: WithKey;
};
