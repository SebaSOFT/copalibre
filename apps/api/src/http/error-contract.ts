import {
  BadRequestException as NestBadRequestException,
  Catch,
  ConflictException as NestConflictException,
  ForbiddenException as NestForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException as NestNotFoundException,
  ServiceUnavailableException as NestServiceUnavailableException,
  UnauthorizedException as NestUnauthorizedException,
  UnprocessableEntityException as NestUnprocessableEntityException,
  type ArgumentsHost,
  type ExceptionFilter,
  type HttpExceptionOptions,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

export interface ApiErrorResponse extends Record<string, unknown> {
  readonly statusCode: number;
  readonly message: string | readonly string[];
  readonly errorCode: string;
}

export interface ApiExceptionOptions extends HttpExceptionOptions {
  readonly errorCode?: string;
}

type DescriptionOrOptions = string | ApiExceptionOptions;

const STATUS_ERROR_CODES: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'bad-request',
  [HttpStatus.UNAUTHORIZED]: 'unauthorized',
  [HttpStatus.FORBIDDEN]: 'forbidden',
  [HttpStatus.NOT_FOUND]: 'not-found',
  [HttpStatus.CONFLICT]: 'conflict',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'unprocessable-entity',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'internal-server-error',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'service-unavailable',
};

const ERROR_LABELS: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'Bad Request',
  [HttpStatus.UNAUTHORIZED]: 'Unauthorized',
  [HttpStatus.FORBIDDEN]: 'Forbidden',
  [HttpStatus.NOT_FOUND]: 'Not Found',
  [HttpStatus.CONFLICT]: 'Conflict',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'Unprocessable Entity',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'Internal Server Error',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'Service Unavailable',
};

/** Stable wire code from an existing typed domain/persistence error code. */
export function toErrorCode(value: string): string {
  const normalized = value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return normalized || 'internal-server-error';
}

export function apiErrorResponse(exception: unknown): ApiErrorResponse {
  if (exception instanceof HttpException) {
    const statusCode = exception.getStatus();
    const response = exception.getResponse();
    const body: Record<string, unknown> =
      typeof response === 'object' && response !== null
        ? { ...(response as Record<string, unknown>) }
        : { message: String(response) };
    const message = messageFrom(body.message, ERROR_LABELS[statusCode] ?? 'Request failed');
    const declaredCode = typeof body.errorCode === 'string' ? body.errorCode : undefined;
    return {
      ...body,
      statusCode,
      message,
      errorCode: toErrorCode(declaredCode ?? STATUS_ERROR_CODES[statusCode] ?? 'http-error'),
    };
  }

  const typedCode = errorCodeFrom(exception);
  return {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    message: typedCode && exception instanceof Error ? exception.message : 'Internal server error',
    error: ERROR_LABELS[HttpStatus.INTERNAL_SERVER_ERROR],
    errorCode: typedCode ?? 'internal-server-error',
  };
}

@Catch()
@Injectable()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = apiErrorResponse(exception);
    this.adapterHost.httpAdapter.reply(
      host.switchToHttp().getResponse(),
      response,
      response.statusCode,
    );
  }
}

function messageFrom(value: unknown, fallback: string): string | readonly string[] {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value;
  return fallback;
}

function errorCodeFrom(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? toErrorCode(error.code) : undefined;
}

function codeFrom(options: DescriptionOrOptions | undefined, fallback: string): string {
  return typeof options === 'object' && options.errorCode
    ? toErrorCode(options.errorCode)
    : fallback;
}

function codedResponse(response: string | object, errorCode: string): Record<string, unknown> {
  return typeof response === 'object' && response !== null
    ? { ...(response as Record<string, unknown>), errorCode }
    : { message: response, errorCode };
}

export class BadRequestException extends NestBadRequestException {
  constructor(objectOrError?: unknown, descriptionOrOptions?: DescriptionOrOptions) {
    const source = new NestBadRequestException(objectOrError, descriptionOrOptions);
    super(codedResponse(source.getResponse(), codeFrom(descriptionOrOptions, 'bad-request')));
  }
}

export class UnauthorizedException extends NestUnauthorizedException {
  constructor(objectOrError?: unknown, descriptionOrOptions?: DescriptionOrOptions) {
    const source = new NestUnauthorizedException(objectOrError, descriptionOrOptions);
    super(codedResponse(source.getResponse(), codeFrom(descriptionOrOptions, 'unauthorized')));
  }
}

export class ForbiddenException extends NestForbiddenException {
  constructor(objectOrError?: unknown, descriptionOrOptions?: DescriptionOrOptions) {
    const source = new NestForbiddenException(objectOrError, descriptionOrOptions);
    super(codedResponse(source.getResponse(), codeFrom(descriptionOrOptions, 'forbidden')));
  }
}

export class NotFoundException extends NestNotFoundException {
  constructor(objectOrError?: unknown, descriptionOrOptions?: DescriptionOrOptions) {
    const source = new NestNotFoundException(objectOrError, descriptionOrOptions);
    super(codedResponse(source.getResponse(), codeFrom(descriptionOrOptions, 'not-found')));
  }
}

export class ConflictException extends NestConflictException {
  constructor(objectOrError?: unknown, descriptionOrOptions?: DescriptionOrOptions) {
    const source = new NestConflictException(objectOrError, descriptionOrOptions);
    super(codedResponse(source.getResponse(), codeFrom(descriptionOrOptions, 'conflict')));
  }
}

export class UnprocessableEntityException extends NestUnprocessableEntityException {
  constructor(objectOrError?: unknown, descriptionOrOptions?: DescriptionOrOptions) {
    const source = new NestUnprocessableEntityException(objectOrError, descriptionOrOptions);
    super(
      codedResponse(source.getResponse(), codeFrom(descriptionOrOptions, 'unprocessable-entity')),
    );
  }
}

export class ServiceUnavailableException extends NestServiceUnavailableException {
  constructor(objectOrError?: unknown, descriptionOrOptions?: DescriptionOrOptions) {
    const source = new NestServiceUnavailableException(objectOrError, descriptionOrOptions);
    super(
      codedResponse(source.getResponse(), codeFrom(descriptionOrOptions, 'service-unavailable')),
    );
  }
}
