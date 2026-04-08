import type {
  ArgumentsHost,
  ExecutionContext,
  HttpArgumentsHost,
  HttpContextValues,
} from '@tsuki-hono/common';
import { HttpContext } from '@tsuki-hono/common';
import type { DependencyContainer } from 'tsyringe';

class HttpArgumentsHostImpl implements HttpArgumentsHost {
  getContext<T = HttpContextValues>(): T {
    return HttpContext.get<T>();
  }
}

export class FrameworkExecutionContext<T extends (...args: any[]) => any>
  implements ExecutionContext, ArgumentsHost
{
  constructor(
    public readonly container: DependencyContainer,
    private readonly target: any,
    private readonly handler: T,
  ) {}

  getClass<T = any>(): T {
    return this.target;
  }

  getHandler(): T {
    return this.handler;
  }

  getContext<T = HttpContextValues>(): T {
    return HttpContext.get<T>();
  }

  switchToHttp(): HttpArgumentsHost {
    return new HttpArgumentsHostImpl();
  }
}

export function createExecutionContext<T extends (...args: any[]) => any>(
  container: DependencyContainer,
  target: any,
  handler: T,
): FrameworkExecutionContext<T> {
  return new FrameworkExecutionContext(container, target, handler);
}
