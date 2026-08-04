import { formatArtifactSecurityFindings, scanOpenApiArtifact } from './artifact-security.js';

describe('OpenAPI artifact security scan', () => {
  it('passes clean generated-document content', () => {
    const findings = scanOpenApiArtifact(
      JSON.stringify({ info: { title: 'CopaLibre API', description: 'Use a short-lived token.' } }),
    );

    expect(findings).toEqual([]);
  });

  const credentialFixture = JSON.stringify({
    // Keep push protection from treating this scanner fixture as a leaked key.
    example: ['sk', 'live', '0123456789abcdefghijklmnop'].join('_'),
  });

  it.each([
    ['credential', credentialFixture],
    ['credential', '{"example":"eyJhbGciOiJIUzI1NiJ9.abcdefghijklmnop.signaturevalue"}'],
    ['internal-hostname', '{"url":"https://api.internal/v1"}'],
    ['private-address', '{"url":"http://192.168.1.25:3000"}'],
  ] as const)('detects planted %s data', (rule, artifact) => {
    expect(scanOpenApiArtifact(artifact)).toEqual([expect.objectContaining({ rule, line: 1 })]);
  });

  it('formats locations without copying the full artifact', () => {
    expect(
      formatArtifactSecurityFindings(scanOpenApiArtifact('{"url":"http://localhost:3000"}')),
    ).toContain('artifact-security internal-hostname: line 1');
  });
});
