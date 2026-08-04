export interface ArtifactSecurityFinding {
  readonly rule: 'credential' | 'internal-hostname' | 'private-address';
  readonly line: number;
  readonly excerpt: string;
}

const RULES: readonly {
  readonly rule: ArtifactSecurityFinding['rule'];
  readonly pattern: RegExp;
}[] = [
  {
    rule: 'credential',
    pattern:
      /(?:eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|(?:sk|pk|rk|ghp|github_pat)_[A-Za-z0-9_-]{16,})/,
  },
  {
    rule: 'internal-hostname',
    pattern: /(?:\blocalhost\b|\b[a-z0-9-]+\.(?:internal|local|corp)\b)/i,
  },
  {
    rule: 'private-address',
    pattern:
      /(?:\b127\.0\.0\.1\b|\b0\.0\.0\.0\b|\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b|\b192\.168\.\d{1,3}\.\d{1,3}\b|\b172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}\b)/,
  },
];

/**
 * Rejects data that would turn a committed static OpenAPI artifact into a
 * credential or topology disclosure. Descriptive words such as "token" are
 * intentionally not matches; only credential-shaped values are rejected.
 */
export function scanOpenApiArtifact(text: string): readonly ArtifactSecurityFinding[] {
  const findings: ArtifactSecurityFinding[] = [];

  for (const [index, line] of text.split('\n').entries()) {
    for (const { rule, pattern } of RULES) {
      if (pattern.test(line)) {
        findings.push({ rule, line: index + 1, excerpt: line.trim() });
      }
    }
  }

  return findings;
}

export function formatArtifactSecurityFindings(
  findings: readonly ArtifactSecurityFinding[],
): string {
  return findings
    .map(({ rule, line, excerpt }) => `artifact-security ${rule}: line ${line}\n  ${excerpt}`)
    .join('\n');
}
