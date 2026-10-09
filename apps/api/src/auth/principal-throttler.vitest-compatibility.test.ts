import { Reflector } from '@nestjs/core';
import { expect, it } from 'vitest';
import { PrincipalThrottlerGuard } from './principal-throttler.guard.js';

it('loads and constructs the NestJS 12 principal throttler under Vitest', () => {
  const guard = new PrincipalThrottlerGuard(
    [{ ttl: 60_000, limit: 10 }] as never,
    { increment: async () => ({}) } as never,
    new Reflector(),
    {} as never,
  );

  expect(guard).toBeInstanceOf(PrincipalThrottlerGuard);
});
