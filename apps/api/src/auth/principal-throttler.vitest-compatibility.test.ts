import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Reflector } from '@nestjs/core';
import { expect, it } from 'vitest';
import { PrincipalThrottlerGuard } from './principal-throttler.guard.js';

it('constructs the NestJS 12 principal throttler under Vitest', () => {
  const guard = new PrincipalThrottlerGuard(
    [{ ttl: 60_000, limit: 10 }] as never,
    { increment: async () => ({}) } as never,
    new Reflector(),
    {} as never,
  );

  expect(guard).toBeInstanceOf(PrincipalThrottlerGuard);
});

it('boots the API throttler provider through the tsx transform', async () => {
  const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url));
  const guardPath = pathToFileURL(
    resolve(repositoryRoot, 'apps/api/src/auth/principal-throttler.guard.ts'),
  ).href;
  const databasePath = pathToFileURL(
    resolve(repositoryRoot, 'apps/api/src/database.token.ts'),
  ).href;
  const tsxPath = resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs');
  const tsconfigPath = resolve(repositoryRoot, 'apps/api/tsconfig.json');
  const script = `
    import { APP_GUARD, Reflector } from '@nestjs/core';
    import { ThrottlerModule } from '@nestjs/throttler';
    import { Test } from '@nestjs/testing';
    import { PrincipalThrottlerGuard } from ${JSON.stringify(guardPath)};
    import { DATABASE } from ${JSON.stringify(databasePath)};

    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1_000 }])],
      providers: [
        { provide: Reflector, useValue: new Reflector() },
        { provide: DATABASE, useValue: {} },
        PrincipalThrottlerGuard,
        { provide: APP_GUARD, useExisting: PrincipalThrottlerGuard },
      ],
    }).compile();
    if (!moduleRef.get(PrincipalThrottlerGuard)) throw new Error('guard provider missing');
    await moduleRef.close();
  `;
  const result = spawnSync(
    process.execPath,
    [tsxPath, '--tsconfig', tsconfigPath, '--eval', script],
    { cwd: repositoryRoot, encoding: 'utf8' },
  );

  expect(result.status, result.stderr || result.stdout).toBe(0);
});
