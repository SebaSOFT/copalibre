import { jest } from '@jest/globals';
import {
  runDoctor,
  validateDatabase,
  validateJwksContent,
  validateObjectStorage,
  validatePersistentPath,
  validatePublicUrls,
  validateRetirableModules,
  validateReverseProxy,
  validateServicePorts,
  type DoctorDependencies,
} from './doctor.js';

const environment: NodeJS.ProcessEnv = {
  DATABASE_URL: 'postgres://copalibre:secret@postgres:5432/copalibre',
  COPALIBRE_APP_URL: 'https://copalibre.example',
  COPALIBRE_BOOTSTRAP_TOKEN: 'opaque-bootstrap-token',
  COPALIBRE_JWKS_URI: 'https://identity.example/jwks.json',
  COPALIBRE_JWT_ISSUER: 'https://identity.example',
  COPALIBRE_JWT_AUDIENCE: 'copalibre',
  COPALIBRE_OIDC_CLIENT_ID: 'copalibre-web',
  COPALIBRE_EMAIL_PROVIDER: 'smtp',
  COPALIBRE_EMAIL_FROM: 'noreply@copalibre.example',
  COPALIBRE_SMTP_URL: 'smtp://smtp.example:587',
};

function dependencies(overrides: Partial<DoctorDependencies> = {}): DoctorDependencies {
  return {
    lookupHost: jest.fn(async () => undefined),
    probeDatabase: jest.fn(async () => undefined),
    ensureWritable: jest.fn(async () => undefined),
    retirableModules: jest.fn(async () => []),
    fetch: jest.fn(async (input: string | URL | Request) => {
      // The JWKS content check and the SSE proxy-conformance check share this
      // default mock; discriminate by URL so each gets a response shaped for
      // what it validates.
      if (String(input).includes('/jwks')) {
        return new Response(
          JSON.stringify({
            keys: [{ kty: 'RSA', kid: 'test-key', use: 'sig', n: 'x', e: 'AQAB' }],
          }),
          { headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(': copalibre-proxy-check-1\n\n: copalibre-proxy-check-2\n\n', {
        headers: {
          'cache-control': 'no-cache, no-transform',
          'content-type': 'text/event-stream',
          'x-accel-buffering': 'no',
        },
      });
    }) as unknown as typeof fetch,
    ...overrides,
  };
}

describe('copalibre doctor', () => {
  it('reports a specific missing dependency and exits non-zero', async () => {
    const report = await runDoctor({}, dependencies());

    expect(report.ok).toBe(false);
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        name: 'secret:DATABASE_URL',
        status: 'fail',
        message: 'DATABASE_URL is required',
      }),
    );
  });

  it('validates complete contract configuration without disclosing secrets', async () => {
    const report = await runDoctor(environment, dependencies());

    expect(report.ok).toBe(true);
    expect(report.checks).toContainEqual(
      expect.objectContaining({ name: 'postgresql', status: 'pass' }),
    );
    expect(report.checks.map((check) => check.message).join('\n')).not.toContain(
      'opaque-bootstrap-token',
    );
  });

  it('reports a PostgreSQL connection failure precisely', async () => {
    const report = await runDoctor(
      environment,
      dependencies({ probeDatabase: async () => Promise.reject(new Error('connection refused')) }),
    );

    expect(report.ok).toBe(false);
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        name: 'postgresql',
        message: 'PostgreSQL is unreachable: connection refused',
      }),
    );
  });

  it('reports malformed URLs and database addresses without attempting startup', async () => {
    await expect(
      validatePublicUrls({ COPALIBRE_APP_URL: 'ftp://copalibre.example' }, dependencies()),
    ).resolves.toContainEqual(expect.objectContaining({ status: 'fail' }));
    await expect(
      validateDatabase({ DATABASE_URL: 'not-a-url' }, dependencies()),
    ).resolves.toContainEqual(expect.objectContaining({ status: 'fail' }));
  });

  it('passes the JWKS content check when the URI serves a valid key set', async () => {
    const report = await validateJwksContent(environment, dependencies());
    expect(report).toContainEqual(
      expect.objectContaining({ name: 'jwks-content', status: 'pass' }),
    );
  });

  it('fails the JWKS content check when the URI is reachable but not a JWKS document', async () => {
    const report = await validateJwksContent(
      environment,
      dependencies({
        fetch: jest.fn(
          async () => new Response('<html>not json</html>', { status: 200 }),
        ) as unknown as typeof fetch,
      }),
    );
    expect(report).toContainEqual(
      expect.objectContaining({
        name: 'jwks-content',
        status: 'fail',
        message: expect.stringContaining('does not serve a valid JWKS document'),
      }),
    );
  });

  it('fails the JWKS content check when the JSON body has no keys array', async () => {
    const report = await validateJwksContent(
      environment,
      dependencies({
        fetch: jest.fn(
          async () => new Response(JSON.stringify({}), { status: 200 }),
        ) as unknown as typeof fetch,
      }),
    );
    expect(report).toContainEqual(
      expect.objectContaining({ name: 'jwks-content', status: 'fail' }),
    );
  });

  it('fails the JWKS content check when the endpoint is unreachable', async () => {
    const report = await validateJwksContent(
      environment,
      dependencies({
        fetch: jest.fn(() => Promise.reject(new Error('ECONNREFUSED'))) as unknown as typeof fetch,
      }),
    );
    expect(report).toContainEqual(
      expect.objectContaining({
        name: 'jwks-content',
        status: 'fail',
        message: expect.stringContaining('ECONNREFUSED'),
      }),
    );
  });

  it('skips the JWKS content check when no URI is configured', async () => {
    await expect(validateJwksContent({}, dependencies())).resolves.toEqual([]);
  });

  it('rejects invalid or colliding service ports', () => {
    expect(validateServicePorts({ COPALIBRE_API_PORT: '0' })).toContainEqual(
      expect.objectContaining({
        status: 'fail',
        message: expect.stringContaining('between 1 and 65535'),
      }),
    );
    expect(
      validateServicePorts({ COPALIBRE_API_PORT: '3001', COPALIBRE_EVENTS_PORT: '3001' }),
    ).toContainEqual(
      expect.objectContaining({ status: 'fail', message: expect.stringContaining('distinct') }),
    );
  });

  it('checks a configured object-storage endpoint and writable path', async () => {
    await expect(
      validateObjectStorage(
        { COPALIBRE_OBJECT_STORAGE_URL: 'https://objects.example' },
        dependencies(),
      ),
    ).resolves.toContainEqual(expect.objectContaining({ status: 'pass' }));
    await expect(
      validateObjectStorage(
        { COPALIBRE_OBJECT_STORAGE_URL: 'ftp://objects.example' },
        dependencies(),
      ),
    ).resolves.toContainEqual(expect.objectContaining({ status: 'fail' }));
    await expect(
      validatePersistentPath(
        { COPALIBRE_DATA_DIR: '/not-writable' },
        dependencies({
          ensureWritable: async () => Promise.reject(new Error('permission denied')),
        }),
      ),
    ).resolves.toContainEqual(expect.objectContaining({ status: 'fail' }));
  });

  it('checks the operator proxy only when requested', async () => {
    const report = await runDoctor(environment, dependencies(), {
      checkProxy: true,
      proxyUrl: 'https://copalibre.example/events/proxy-check',
    });

    expect(report.ok).toBe(true);
    expect(report.checks).toContainEqual(
      expect.objectContaining({ name: 'reverse-proxy', status: 'pass' }),
    );
  });

  it('validates native email-provider credentials through the same contract', async () => {
    const report = await runDoctor(
      {
        ...environment,
        COPALIBRE_EMAIL_PROVIDER: 'resend',
        COPALIBRE_RESEND_API_KEY: 'resend-key',
        COPALIBRE_SMTP_URL: undefined,
      },
      dependencies(),
    );

    expect(report.checks).toContainEqual(
      expect.objectContaining({
        name: 'smtp',
        status: 'pass',
        message: expect.stringContaining('resend'),
      }),
    );
  });

  it('catches a buffering proxy response', async () => {
    const check = await validateReverseProxy(
      { proxyUrl: 'https://copalibre.example/events/proxy-check' },
      dependencies({
        fetch: jest.fn(
          async () =>
            new Response(': copalibre-proxy-check-1\n\n: copalibre-proxy-check-2\n\n', {
              headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-transform' },
            }),
        ) as unknown as typeof fetch,
      }),
    );

    expect(check).toMatchObject({ status: 'fail', message: expect.stringContaining('buffering') });
  });

  it('requires a proxy URL when conformance is requested', async () => {
    await expect(validateReverseProxy({}, dependencies())).resolves.toMatchObject({
      status: 'fail',
      message: expect.stringContaining('--proxy-url'),
    });
  });

  it('rejects proxies that omit SSE semantics', async () => {
    const typeCheck = await validateReverseProxy(
      { proxyUrl: 'https://copalibre.example/events/proxy-check' },
      dependencies({
        fetch: jest.fn(async () => new Response('not sse')) as unknown as typeof fetch,
      }),
    );
    const cacheCheck = await validateReverseProxy(
      { proxyUrl: 'https://copalibre.example/events/proxy-check' },
      dependencies({
        fetch: jest.fn(
          async () =>
            new Response(': copalibre-proxy-check-1\n\n: copalibre-proxy-check-2\n\n', {
              headers: { 'content-type': 'text/event-stream', 'x-accel-buffering': 'no' },
            }),
        ) as unknown as typeof fetch,
      }),
    );

    expect(typeCheck.message).toContain('content type');
    expect(cacheCheck.message).toContain('no-transform');
  });

  it('rejects a proxy that buffers the initial heartbeat until its stream closes', async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const delayedBody = new ReadableStream<Uint8Array>({
      start(controller) {
        timer = setTimeout(() => {
          controller.enqueue(new TextEncoder().encode(': copalibre-proxy-check-1\n\n'));
          controller.enqueue(new TextEncoder().encode(': copalibre-proxy-check-2\n\n'));
          controller.close();
        }, 1_100);
      },
      cancel() {
        if (timer !== undefined) clearTimeout(timer);
      },
    });
    const check = await validateReverseProxy(
      { proxyUrl: 'https://copalibre.example/events/proxy-check' },
      dependencies({
        fetch: jest.fn(
          async () =>
            new Response(delayedBody, {
              headers: {
                'content-type': 'text/event-stream',
                'cache-control': 'no-cache, no-transform',
                'x-accel-buffering': 'no',
              },
            }),
        ) as unknown as typeof fetch,
      }),
    );

    expect(check).toMatchObject({ status: 'fail', message: expect.stringContaining('timeout') });
  });

  it('skips the retirable-modules check when no database is configured', async () => {
    const check = await validateRetirableModules({}, dependencies());
    expect(check).toMatchObject({ name: 'retirable-modules', status: 'skip' });
  });

  it('reports retirable module versions by alias', async () => {
    const check = await validateRetirableModules(
      environment,
      dependencies({
        retirableModules: async () => [{ alias: 'orbital-frisbee', version: '1.0.0' }],
      }),
    );
    expect(check).toMatchObject({
      name: 'retirable-modules',
      status: 'pass',
      message: expect.stringContaining('orbital-frisbee@1.0.0'),
    });
  });

  it('passes with no retirable versions when none are found', async () => {
    const check = await validateRetirableModules(environment, dependencies());
    expect(check).toMatchObject({ name: 'retirable-modules', status: 'pass' });
    expect(check.message).toContain('No installed discipline versions are retirable');
  });

  it('fails the retirable-modules check when the query itself fails', async () => {
    const check = await validateRetirableModules(
      environment,
      dependencies({
        retirableModules: async () => Promise.reject(new Error('connection refused')),
      }),
    );
    expect(check).toMatchObject({
      name: 'retirable-modules',
      status: 'fail',
      message: expect.stringContaining('connection refused'),
    });
  });

  it('requires both a recognizable first heartbeat and a later idle heartbeat', async () => {
    const headers = {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    };
    const missingFirst = await validateReverseProxy(
      { proxyUrl: 'https://copalibre.example/events/proxy-check' },
      dependencies({
        fetch: jest.fn(
          async () => new Response(': unrelated\n\n', { headers }),
        ) as unknown as typeof fetch,
      }),
    );
    const missingSecond = await validateReverseProxy(
      { proxyUrl: 'https://copalibre.example/events/proxy-check' },
      dependencies({
        fetch: jest.fn(
          async () => new Response(': copalibre-proxy-check-1\n\n', { headers }),
        ) as unknown as typeof fetch,
      }),
    );
    const twoChunks = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(': copalibre-proxy-check-1\n\n'));
        controller.enqueue(encoder.encode(': still-open\n\n'));
        controller.enqueue(encoder.encode(': copalibre-proxy-check-2\n\n'));
        controller.close();
      },
    });
    const validStream = await validateReverseProxy(
      { proxyUrl: 'https://copalibre.example/events/proxy-check' },
      dependencies({
        fetch: jest.fn(async () => new Response(twoChunks, { headers })) as unknown as typeof fetch,
      }),
    );

    expect(missingFirst.message).toContain('initial SSE heartbeat');
    expect(missingSecond.message).toContain('idle heartbeat');
    expect(validStream.status).toBe('pass');
  });
});
