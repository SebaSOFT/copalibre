import { jest } from '@jest/globals';
import { BadRequestException as NestBadRequestException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import {
  ApiExceptionFilter,
  BadRequestException,
  apiErrorResponse,
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
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost;

    new ApiExceptionFilter(adapterHost).catch(new BadRequestException('Invalid input'), host);

    expect(reply).toHaveBeenCalledWith(
      response,
      expect.objectContaining({ message: 'Invalid input', errorCode: 'bad-request' }),
      400,
    );
  });
});
