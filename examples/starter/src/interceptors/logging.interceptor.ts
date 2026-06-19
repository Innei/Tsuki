import type {
  CallHandler,
  ExecutionContext,
  FrameworkResponse,
  Interceptor,
} from '@tsuki-hono/common';
import { createLogger } from '@tsuki-hono/common';
import pc from 'picocolors';
import { injectable } from 'tsyringe';

const logger = createLogger('HTTP');

@injectable()
export class LoggingInterceptor implements Interceptor {
  async intercept(context: ExecutionContext, next: CallHandler): Promise<FrameworkResponse> {
    const { hono } = context.getContext();
    const { method, url } = hono.req;
    const start = performance.now();

    logger.debug(`${pc.dim('→')} ${method} ${url}`);

    try {
      const response = await next.handle();
      const ms = (performance.now() - start).toFixed(1);
      logger.debug(
        `${pc.dim('←')} ${method} ${url} ${pc.cyan(response.status)} ${pc.yellow(`+${ms}ms`)}`,
      );
      return response;
    } catch (error) {
      const ms = (performance.now() - start).toFixed(1);
      logger.warn(`${pc.dim('×')} ${method} ${url} ${pc.red('threw')} ${pc.yellow(`+${ms}ms`)}`);
      throw error;
    }
  }
}
