import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Module, type INestApplication } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { OpenAPIObject } from '@nestjs/swagger';
import { TokenVerifier } from '../auth/token-verifier.js';
import { DATABASE } from '../database.token.js';
import { HealthController } from '../health.controller.js';
import { OrganizationsController } from '../controllers/organizations.controller.js';
import { TournamentsController } from '../controllers/tournaments.controller.js';
import { buildOpenApiDocument } from './document.js';
import { collectRoutePlanes } from './collect-planes.js';
import { lintOpenApiContract } from './contract-lint.js';

const CONTROLLERS = [HealthController, OrganizationsController, TournamentsController] as const;
const ARTIFACT_PATH = join(import.meta.dirname, '../../../../packages/contracts/openapi/v1.json');

/**
 * The committed artifact must match what the decorated controllers produce.
 * Without this, someone could change a route and ship a stale spec — and
 * `packages/contracts`' generated client types would silently describe an API
 * that no longer exists.
 */
describe('OpenAPI artifact', () => {
  let app: INestApplication;
  let generated: OpenAPIObject;

  beforeAll(async () => {
    @Module({
      controllers: [...CONTROLLERS],
      providers: [
        { provide: DATABASE, useValue: {} },
        { provide: TokenVerifier, useValue: {} },
      ],
    })
    class OpenApiTestModule {}

    const moduleRef = await Test.createTestingModule({ imports: [OpenApiTestModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    generated = buildOpenApiDocument(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('matches the committed artifact exactly', () => {
    const committed = JSON.parse(readFileSync(ARTIFACT_PATH, 'utf8')) as OpenAPIObject;
    // If this fails: run `yarn workspace @copalibre/api run openapi:generate`
    // and `yarn workspace @copalibre/contracts run generate`, then commit both.
    expect(generated).toEqual(committed);
  });

  it('passes contract lint', () => {
    expect(lintOpenApiContract(generated, collectRoutePlanes(CONTROLLERS))).toEqual([]);
  });

  it('declares every route with a security plane', () => {
    const planes = collectRoutePlanes(CONTROLLERS);
    const routes = Object.entries(generated.paths ?? {}).flatMap(([path, item]) =>
      Object.keys(item as Record<string, unknown>)
        .filter((method) => ['get', 'post', 'put', 'patch', 'delete'].includes(method))
        .map((method) => `${method.toUpperCase()} ${path}`),
    );
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      expect(planes[route]).toBeDefined();
    }
  });

  it('advertises bearer security on authenticated routes only', () => {
    const planes = collectRoutePlanes(CONTROLLERS);
    for (const [path, item] of Object.entries(generated.paths ?? {})) {
      for (const [method, operation] of Object.entries(item as Record<string, unknown>)) {
        if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
        const route = `${method.toUpperCase()} ${path}`;
        const declaresBearer = ((operation as { security?: unknown[] }).security ?? []).length > 0;
        expect(declaresBearer).toBe(planes[route] !== 'public-read');
      }
    }
  });

  it('exposes the bearer security scheme and no other', () => {
    expect(Object.keys(generated.components?.securitySchemes ?? {})).toEqual(['bearer']);
  });
});
