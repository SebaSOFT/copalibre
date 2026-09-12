import {
  BadRequestException as NestBadRequestException,
  Catch,
  ConflictException as NestConflictException,
  ForbiddenException as NestForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException as NestNotFoundException,
  ServiceUnavailableException as NestServiceUnavailableException,
  UnauthorizedException as NestUnauthorizedException,
  UnprocessableEntityException as NestUnprocessableEntityException,
  type ArgumentsHost,
  type ExceptionFilter,
  type HttpExceptionOptions,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Kysely } from 'kysely';
import type { AuditAction } from '@copalibre/domain';
import {
  recordAuditRefusal,
  SYSTEM_ORGANIZATION,
  type AuditRefusalEntry,
  type Database,
} from '@copalibre/persistence';
import { DATABASE } from '../database.token.js';
import type { RequestWithSubject } from '../auth/request-context.js';

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

/**
 * Which refusal category a status code represents, per proposal.md's three
 * illustrative scenarios (a blocked mutation, an authorization refusal, a
 * competition-state refusal) — collapsed to two actions rather than one per
 * refusal reason, so the filter catches "refusals... including ones that
 * will be added later" without a controller ever registering a new one.
 * The specific reason lives in the record's `reason` field, not the action.
 * `undefined` for anything that is not a refusal of a consequential
 * operation (400 validation noise, 404, 500) — design.md, "record every
 * 4xx. Rejected: a validation error on a malformed request body is noise."
 */
function refusalActionFor(statusCode: number): AuditAction | undefined {
  if (statusCode === HttpStatus.UNAUTHORIZED || statusCode === HttpStatus.FORBIDDEN) {
    return 'authorization.refused';
  }
  if (statusCode === HttpStatus.CONFLICT) {
    return 'mutation.refused';
  }
  return undefined;
}

export interface MinimalRefusalRequest {
  readonly method?: string;
  readonly url?: string;
  readonly subject?: RequestWithSubject['subject'];
}

/**
 * The refusal to record for this response, or `undefined` when the status
 * is not a refusal of a consequential operation. Pure and independent of
 * Nest/Kysely so it is testable without a fake database or `ArgumentsHost` —
 * `ApiExceptionFilter` below is the only caller, and only wires this to
 * `recordAuditRefusal`.
 */
export function refusalEntryFor(
  response: ApiErrorResponse,
  request: MinimalRefusalRequest,
): AuditRefusalEntry | undefined {
  const action = refusalActionFor(response.statusCode);
  if (action === undefined) return undefined;

  const subject = request.subject;
  const reason =
    typeof response.message === 'string' ? response.message : response.message.join('; ');
  // `audit_log.entity_id` is a `uuid` column — the filter has no reliable
  // way to resolve a route's alias params to a domain aggregate's id
  // without its own database round trips, so a route-level refusal is
  // scoped to the organization (already a real uuid, or the installation-
  // wide sentinel) and the method/path go into `previousState` instead.
  const organizationId = subject?.organizationId ?? SYSTEM_ORGANIZATION;

  return {
    organizationId,
    entityType: 'organization',
    entityId: organizationId,
    action,
    // An unauthenticated refusal names the absence rather than inventing an
    // actor (task 2.4) — there is no subject to attribute it to.
    actor: subject ? `user:${subject.principalId ?? subject.subjectId}` : 'unauthenticated',
    authorizationContext: (subject?.scopes ?? []).join(' '),
    reason,
    previousState: { method: request.method ?? 'UNKNOWN', path: request.url ?? 'unknown' },
  };
}

@Catch()
@Injectable()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  constructor(
    @Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost,
    @Inject(DATABASE) private readonly db: Kysely<Database>,
  ) {}

  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const response = apiErrorResponse(exception);
    // Recorded before the reply is sent, not after: once `reply()` below
    // completes, the HTTP transaction is over from the transport's
    // perspective (Fastify's `inject()` resolves the moment the response is
    // flushed, independent of whatever this async function does next) — so
    // "record afterward" can never be observed as done by the time a caller
    // sees the response, only "eventually". Recording first still cannot
    // turn this refusal into a server error: `recordAuditRefusal` swallows
    // its own failure and reports it to `this.logger`, never rethrowing
    // (proposal.md, "Risk concentrated in one place").
    await this.recordRefusal(response, host);
    this.adapterHost.httpAdapter.reply(
      host.switchToHttp().getResponse(),
      response,
      response.statusCode,
    );
  }

  private async recordRefusal(response: ApiErrorResponse, host: ArgumentsHost): Promise<void> {
    const request = host.switchToHttp().getRequest<MinimalRefusalRequest>();
    const entry = refusalEntryFor(response, request);
    if (entry === undefined) return;

    await recordAuditRefusal(this.db, entry, (error) =>
      this.logger.error('Failed to record a refusal audit entry', error as Error),
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
