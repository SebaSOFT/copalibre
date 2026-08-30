import { jest } from '@jest/globals';
import { BadRequestException as NestBadRequestException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import {
  ApiExceptionFilter,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  apiErrorResponse,
  refusalEntryFor,
  toErrorCode,
} from './error-contract.js';

describe('API error contract', () => {
  it('normalizes existing typed error codes to kebab-case', () => {
    expect(toErrorCode('DOMAIN_INVARIANT_VIOLATION')).toBe('domain-invariant-violation');
    expect(toErrorCode('RulesetCompilationError')).toBe('ruleset-compilation-error');
  });

  it('adds a stable code without removing Nest response fields', () => {
    const response = apiErrorResponse(new BadRequestException('Alias is required'));

    expect(response).toEqual({
      statusCode: 400,
      message: 'Alias is required',
      error: 'Bad Request',
      errorCode: 'bad-request',
    });
  });

  it('preserves a controller-declared condition code', () => {
    expect(
      apiErrorResponse(
        new BadRequestException('Alias is already used', { errorCode: 'club-alias-conflict' }),
      ),
    ).toMatchObject({ errorCode: 'club-alias-conflict' });
  });

  it('adds a fallback code to an uncoded Nest exception', () => {
    expect(apiErrorResponse(new NestBadRequestException('Invalid input'))).toMatchObject({
      statusCode: 400,
      message: 'Invalid input',
      errorCode: 'bad-request',
    });
  });

  it('derives a code from an existing typed error class', () => {
    class TypedError extends Error {
      readonly code = 'DOMAIN_INVARIANT_VIOLATION';
    }

    expect(apiErrorResponse(new TypedError('Broken invariant'))).toMatchObject({
      statusCode: 500,
      message: 'Broken invariant',
      errorCode: 'domain-invariant-violation',
    });
  });

  it('does not expose an untyped internal error message', () => {
    expect(apiErrorResponse(new Error('database password leaked here'))).toMatchObject({
      statusCode: 500,
      message: 'Internal server error',
      errorCode: 'internal-server-error',
    });
  });

  it('writes the additive response through the HTTP adapter', () => {
    const reply = jest.fn();
    const adapterHost = { httpAdapter: { reply } } as unknown as HttpAdapterHost;
    const response = {};
    const host = {
      switchToHttp: () => ({ getResponse: () => response, getRequest: () => ({}) }),
    } as unknown as ArgumentsHost;
    const db = {} as unknown as ConstructorParameters<typeof ApiExceptionFilter>[1];

    new ApiExceptionFilter(adapterHost, db).catch(new BadRequestException('Invalid input'), host);

    expect(reply).toHaveBeenCalledWith(
      response,
      expect.objectContaining({ message: 'Invalid input', errorCode: 'bad-request' }),
      400,
    );
  });
});

describe('refusalEntryFor', () => {
  it('records an authorization refusal naming the capability that was lacking', () => {
    const response = apiErrorResponse(
      new ForbiddenException('Requires capability "org.manage-clubs"', {
        errorCode: 'capability-forbidden',
      }),
    );
    const entry = refusalEntryFor(response, {
      method: 'POST',
      url: '/organizations/liga-orbital/clubs',
      subject: { subjectId: 'user-1', organizationId: 'org-1', scopes: ['copalibre.control'] },
    });

    expect(entry).toEqual({
      organizationId: 'org-1',
      entityType: 'organization',
      entityId: 'org-1',
      action: 'authorization.refused',
      actor: 'user:user-1',
      authorizationContext: 'copalibre.control',
      reason: 'Requires capability "org.manage-clubs"',
      previousState: { method: 'POST', path: '/organizations/liga-orbital/clubs' },
    });
  });

  it('names the actor absence, never an invented one, for an unauthenticated refusal', () => {
    const response = apiErrorResponse(new UnauthorizedException('Missing bearer token'));
    const entry = refusalEntryFor(response, { method: 'GET', url: '/organizations' });

    expect(entry?.actor).toBe('unauthenticated');
    expect(entry?.action).toBe('authorization.refused');
    expect(entry?.organizationId).toBe('00000000-0000-0000-0000-000000000000');
  });

  it('records a lifecycle/mutation-classification refusal as a conflict', () => {
    const response = apiErrorResponse(
      new ConflictException('Field "series.span" is blocked after results', {
        errorCode: 'stage-conflict',
      }),
    );
    const entry = refusalEntryFor(response, {
      method: 'PATCH',
      url: '/organizations/liga-orbital/tournaments/open-cup/stages/1/series',
      subject: { subjectId: 'user-1', organizationId: 'org-1', scopes: [] },
    });

    expect(entry?.action).toBe('mutation.refused');
    expect(entry?.reason).toBe('Field "series.span" is blocked after results');
  });

  it('does not record a validation error, a not-found, or a server error', () => {
    const request = { method: 'GET', url: '/x' };
    expect(
      refusalEntryFor(apiErrorResponse(new BadRequestException('bad')), request),
    ).toBeUndefined();
    expect(
      refusalEntryFor(apiErrorResponse(new NotFoundException('missing')), request),
    ).toBeUndefined();
    expect(refusalEntryFor(apiErrorResponse(new Error('boom')), request)).toBeUndefined();
  });
});
