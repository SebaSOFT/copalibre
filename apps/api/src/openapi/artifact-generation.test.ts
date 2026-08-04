import { Controller, Get, Module, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { buildOpenApiDocument } from './document.js';
import { serializeOpenApiArtifact } from './artifact.js';

@Controller('fixture-status')
class FixtureStatusController {
  @Get()
  @ApiOperation({ summary: 'Read fixture status' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      required: ['status'],
      properties: { status: { type: 'string', example: 'ready' } },
    },
  })
  read(): { readonly status: string } {
    return { status: 'ready' };
  }
}

@Module({ controllers: [FixtureStatusController] })
class FixtureOpenApiModule {}

describe('OpenAPI artifact generation', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [FixtureOpenApiModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('serializes a known Nest controller fixture into a versioned OpenAPI document', () => {
    const artifact = JSON.parse(serializeOpenApiArtifact(buildOpenApiDocument(app))) as {
      readonly info: { readonly version: string };
      readonly paths: Record<string, { readonly get?: { readonly summary?: string } }>;
    };

    expect(artifact.info.version).toBe('4.0.0');
    expect(artifact.paths['/fixture-status']?.get?.summary).toBe('Read fixture status');
  });
});
