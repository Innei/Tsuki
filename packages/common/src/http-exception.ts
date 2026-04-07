export class HttpException extends Error {
  readonly response: unknown;
  readonly status: number;

  constructor(response: unknown, status: number, message?: string, options?: ErrorOptions) {
    super(message ?? (typeof response === 'string' ? response : 'Http Exception'), options);
    this.response = response;
    this.status = status;
  }

  getStatus(): number {
    return this.status;
  }

  getResponse<T = unknown>(): T {
    return this.response as T;
  }
}

function createHttpException(status: number, defaultMessage: string) {
  return class extends HttpException {
    constructor(response?: unknown, message?: string, options?: ErrorOptions) {
      super(
        response ?? { statusCode: status, message: message ?? defaultMessage },
        status,
        message,
        options,
      );
    }
  };
}

export const BadRequestException = createHttpException(400, 'Bad Request');
export const UnauthorizedException = createHttpException(401, 'Unauthorized');
export const ForbiddenException = createHttpException(403, 'Forbidden');
export const NotFoundException = createHttpException(404, 'Not Found');
export const InternalServerErrorException = createHttpException(500, 'Internal Server Error');
