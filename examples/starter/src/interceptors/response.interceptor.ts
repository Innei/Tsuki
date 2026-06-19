import type {
  CallHandler,
  ExecutionContext,
  FrameworkResponse,
  Interceptor,
} from '@tsuki-hono/common';
import { injectable } from 'tsyringe';

import { isResponsePassthrough } from '../common/decorators/response-passthrough.decorator';
import { isExplicitSuccessEnvelope, type SuccessEnvelope } from '../common/response/envelope.types';

function isJson(contentType: string | null): boolean {
  return Boolean(contentType && contentType.toLowerCase().includes('json'));
}

@injectable()
export class ResponseInterceptor implements Interceptor {
  async intercept(context: ExecutionContext, next: CallHandler): Promise<FrameworkResponse> {
    if (isResponsePassthrough(context.getHandler(), context.getClass())) {
      return next.handle();
    }

    const response = await next.handle();

    if (response.status === 204 || response.status === 304) {
      return response;
    }
    if (!isJson(response.headers.get('content-type'))) {
      return response;
    }

    let raw: string;
    try {
      raw = await response.clone().text();
    } catch {
      return response;
    }
    if (!raw) return response;

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return response;
    }

    if (
      payload &&
      typeof payload === 'object' &&
      ('error' in (payload as object) || 'data' in (payload as object))
    ) {
      return response;
    }

    const envelope: SuccessEnvelope = isExplicitSuccessEnvelope(payload)
      ? payload
      : { data: payload };

    const headers = new Headers(response.headers);
    headers.delete('content-length');

    return new Response(JSON.stringify(envelope), {
      status: response.status,
      statusText: response.statusText,
      headers,
    }) as FrameworkResponse;
  }
}
