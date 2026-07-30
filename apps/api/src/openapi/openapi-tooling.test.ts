import { Controller, Get, Post } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { SecurityPlaneTag } from '../auth/security-plane';
import { detectBreakingChanges } from './breaking-change';
import { collectRoutePlanes } from './collect-planes';
import { lintOpenApiContract, type RoutePlanes } from './contract-lint';

/**
 * Fixtures are hand-built OpenAPI fragments, so they are typed loosely here and
 * cast once. The real generated document is type-checked by @nestjs/swagger and
 * covered by artifact.test.ts.
 */
type PathsFixture = Record<string, Record<string, unknown>>;

function documentWith(paths: PathsFixture): OpenAPIObject {
  return {
    openapi: '3.0.0',
    info: { title: 't', version: '1' },
    paths,
  } as unknown as OpenAPIObject;
}

const okJson = {
  '200': {
    description: 'OK',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/X' } } },
  },
};

describe('contract lint', () => {
  it('passes a fully specified public route', () => {
    const document = documentWith({
      '/things': { get: { summary: 'List things', responses: okJson } },
    });
    const planes: RoutePlanes = { 'GET /things': 'public-read' };
    expect(lintOpenApiContract(document, planes)).toEqual([]);
  });

  it('fails a route with no declared security plane', () => {
    const document = documentWith({
      '/things': { get: { summary: 'List things', responses: okJson } },
    });
    const findings = lintOpenApiContract(document, {});
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      route: 'GET /things',
      rule: 'missing-security-plane',
    });
  });

  it('fails an authenticated route that advertises no bearer security', () => {
    const document = documentWith({
      '/things': { post: { summary: 'Create', responses: okJson } },
    });
    const findings = lintOpenApiContract(document, { 'POST /things': 'admin-control' });
    expect(findings[0]).toMatchObject({ rule: 'authenticated-route-without-bearer' });
    expect(findings[0]?.message).toContain('copalibre.control');
  });

  it('fails a public route that advertises bearer security', () => {
    const document = documentWith({
      '/things': {
        get: { summary: 'List', responses: okJson, security: [{ bearer: [] }] },
      },
    });
    const findings = lintOpenApiContract(document, { 'GET /things': 'public-read' });
    expect(findings[0]).toMatchObject({ rule: 'public-route-with-bearer' });
  });

  it('fails an undocumented route and one with no typed success response', () => {
    const document = documentWith({
      '/things': { get: { responses: { '204': { description: 'No Content' } } } },
    });
    const rules = lintOpenApiContract(document, { 'GET /things': 'public-read' }).map(
      (finding) => finding.rule,
    );
    expect(rules).toEqual(
      expect.arrayContaining(['missing-operation-summary', 'missing-response-schema']),
    );
  });

  it('accepts an authenticated route that does advertise bearer', () => {
    const document = documentWith({
      '/things': {
        post: { summary: 'Create', responses: okJson, security: [{ bearer: [] }] },
      },
    });
    expect(lintOpenApiContract(document, { 'POST /things': 'admin-control' })).toEqual([]);
  });
});

describe('collectRoutePlanes', () => {
  @Controller('widgets')
  class WidgetsController {
    @Get(':id')
    @SecurityPlaneTag('public-read')
    read(): void {}

    @Post()
    @SecurityPlaneTag('admin-control')
    create(): void {}

    @Get('untagged')
    untagged(): void {}
  }

  @SecurityPlaneTag('integration')
  @Controller('hooks')
  class HooksController {
    @Post('deliver')
    deliver(): void {}
  }

  it('reads planes off method decorators and converts :param to {param}', () => {
    const planes = collectRoutePlanes([WidgetsController]);
    expect(planes['GET /widgets/{id}']).toBe('public-read');
    expect(planes['POST /widgets']).toBe('admin-control');
  });

  it('omits routes with no plane so contract-lint reports them', () => {
    const planes = collectRoutePlanes([WidgetsController]);
    expect(planes['GET /widgets/untagged']).toBeUndefined();
  });

  it('inherits a controller-level plane when the method declares none', () => {
    const planes = collectRoutePlanes([HooksController]);
    expect(planes['POST /hooks/deliver']).toBe('integration');
  });
});

/**
 * Typed accessor for the request-body schema of POST /things in a cloned
 * document. Avoids non-null assertions (banned by the lint gate) while keeping
 * the mutation tests readable.
 */
interface MutableBodySchema {
  required: string[];
  properties: Record<string, { type?: string; enum?: string[] }>;
}

function bodySchemaOf(document: OpenAPIObject): MutableBodySchema {
  const post = document.paths['/things']?.post as
    { requestBody?: { content?: Record<string, { schema?: MutableBodySchema }> } } | undefined;
  const schema = post?.requestBody?.content?.['application/json']?.schema;
  if (!schema) throw new Error('fixture is missing the POST /things request schema');
  return schema;
}

function propertyOf(schema: MutableBodySchema, name: string): { type?: string; enum?: string[] } {
  const property = schema.properties[name];
  if (!property) throw new Error(`fixture is missing body property "${name}"`);
  return property;
}

describe('breaking-change detection', () => {
  const published = documentWith({
    '/things': {
      get: { summary: 'List', responses: okJson },
      post: {
        summary: 'Create',
        responses: okJson,
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string' },
                  mode: { type: 'string', enum: ['fast', 'slow'] },
                },
              },
            },
          },
        },
      },
    },
  });

  /** The published POST operation, loosely typed for fixture reuse. */
  function publishedPost(): Record<string, unknown> {
    return (published.paths['/things'] as Record<string, Record<string, unknown>>).post as Record<
      string,
      unknown
    >;
  }

  it('reports nothing when the artifact is unchanged', () => {
    expect(detectBreakingChanges(published, published)).toEqual([]);
  });

  it('detects a removed route', () => {
    const next = documentWith({
      '/things': { post: publishedPost() },
    });
    expect(detectBreakingChanges(published, next)).toEqual([
      expect.objectContaining({ kind: 'route-removed', location: 'GET /things' }),
    ]);
  });

  it('detects a removed path entirely', () => {
    expect(detectBreakingChanges(published, documentWith({}))).toHaveLength(2);
  });

  it('detects newly required authentication on a previously anonymous route', () => {
    const next = documentWith({
      '/things': {
        post: publishedPost(),
        get: { summary: 'List', responses: okJson, security: [{ bearer: [] }] },
      },
    });
    expect(detectBreakingChanges(published, next)).toEqual([
      expect.objectContaining({ kind: 'security-added' }),
    ]);
  });

  it('detects a removed success response schema', () => {
    const next = documentWith({
      '/things': {
        ...published.paths['/things'],
        get: { summary: 'List', responses: { '200': { description: 'OK' } } },
      },
    });
    expect(detectBreakingChanges(published, next)).toEqual([
      expect.objectContaining({ kind: 'response-schema-removed' }),
    ]);
  });

  it('detects a newly required request field', () => {
    const next = structuredClone(published) as OpenAPIObject;
    bodySchemaOf(next).required = ['name', 'region'];
    expect(detectBreakingChanges(published, next)).toEqual([
      expect.objectContaining({
        kind: 'required-request-field-added',
        location: 'POST /things body.region',
      }),
    ]);
  });

  it('detects a request field type change', () => {
    const next = structuredClone(published) as OpenAPIObject;
    propertyOf(bodySchemaOf(next), 'name').type = 'number';
    expect(detectBreakingChanges(published, next)).toEqual([
      expect.objectContaining({ kind: 'request-field-type-changed' }),
    ]);
  });

  it('detects a removed enum value', () => {
    const next = structuredClone(published) as OpenAPIObject;
    propertyOf(bodySchemaOf(next), 'mode').enum = ['fast'];
    expect(detectBreakingChanges(published, next)).toEqual([
      expect.objectContaining({ kind: 'enum-value-removed' }),
    ]);
  });

  it('treats an added optional field and an added route as non-breaking', () => {
    const next = structuredClone(published) as OpenAPIObject;
    bodySchemaOf(next).properties.note = { type: 'string' };
    (next.paths as Record<string, unknown>)['/other'] = {
      get: { summary: 'New', responses: okJson },
    };
    expect(detectBreakingChanges(published, next)).toEqual([]);
  });

  it('resolves $ref request schemas before comparing', () => {
    const withRef = (required: readonly string[]): OpenAPIObject =>
      ({
        openapi: '3.0.0',
        info: { title: 't', version: '1' },
        paths: {
          '/things': {
            post: {
              summary: 'Create',
              responses: okJson,
              requestBody: {
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/Body' } },
                },
              },
            },
          },
        },
        components: {
          schemas: { Body: { type: 'object', required: [...required], properties: {} } },
        },
      }) as OpenAPIObject;

    expect(detectBreakingChanges(withRef(['a']), withRef(['a', 'b']))).toEqual([
      expect.objectContaining({
        kind: 'required-request-field-added',
        location: 'POST /things body.b',
      }),
    ]);
  });
});

describe('breaking-change edge cases', () => {
  it('ignores non-2xx response changes', () => {
    const before = documentWith({
      '/things': {
        get: {
          summary: 'L',
          responses: {
            ...okJson,
            '500': { description: 'Server error', content: { 'application/json': { schema: {} } } },
          },
        },
      },
    });
    const after = documentWith({ '/things': { get: { summary: 'L', responses: okJson } } });
    expect(detectBreakingChanges(before, after)).toEqual([]);
  });

  it('skips comparison when a request body has no resolvable schema', () => {
    const before = documentWith({
      '/things': { post: { summary: 'C', responses: okJson, requestBody: {} } },
    });
    const after = documentWith({
      '/things': { post: { summary: 'C', responses: okJson, requestBody: {} } },
    });
    expect(detectBreakingChanges(before, after)).toEqual([]);
  });

  it('skips a request body whose $ref cannot be resolved', () => {
    const doc = (): OpenAPIObject =>
      ({
        openapi: '3.0.0',
        info: { title: 't', version: '1' },
        paths: {
          '/things': {
            post: {
              summary: 'C',
              responses: okJson,
              requestBody: {
                content: { 'application/json': { schema: { $ref: '#/components/schemas/Gone' } } },
              },
            },
          },
        },
      }) as OpenAPIObject;
    expect(detectBreakingChanges(doc(), doc())).toEqual([]);
  });

  it('ignores methods absent from the published artifact', () => {
    const before = documentWith({ '/things': { get: { summary: 'L', responses: okJson } } });
    const after = documentWith({
      '/things': {
        get: { summary: 'L', responses: okJson },
        delete: { summary: 'D', responses: okJson },
      },
    });
    expect(detectBreakingChanges(before, after)).toEqual([]);
  });
});
