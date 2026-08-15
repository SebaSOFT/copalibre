import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Enforces the "Enterprise-ready is an evidence-gated claim, enforced
// structurally, not just by convention" decision: docs/deployment/
// enterprise-kubernetes.md must not assert Kubernetes enterprise-readiness
// without linking a dated, passing evidence report from BOTH the
// multi-node-failover and backup-restore validations (spec.md's
// "Enterprise-readiness claims are evidence-gated" requirement).

const READINESS_CLAIM_PATTERN =
  /enterprise[-\s]ready|enterprise readiness|production[-\s]ready kubernetes|enterprise kubernetes support/i;

const MARKDOWN_LINK_PATTERN = /\]\(([^)]+)\)/g;

export function containsReadinessClaim(docText) {
  return READINESS_CLAIM_PATTERN.test(docText);
}

export function extractEvidenceLinks(docText) {
  const links = [];
  for (const match of docText.matchAll(MARKDOWN_LINK_PATTERN)) {
    const target = match[1];
    if (target.includes('evidence/') && target.endsWith('.md')) links.push(target);
  }
  return links;
}

/**
 * @param {string} docText
 * @param {(relativePath: string) => string | undefined} readEvidenceFile
 *   Returns the evidence file's content for a link extracted from docText,
 *   or undefined if no such file exists.
 */
export function validateReadinessGate(docText, readEvidenceFile) {
  if (!containsReadinessClaim(docText)) return { ok: true, problems: [] };

  const links = extractEvidenceLinks(docText);
  const problems = [];

  for (const category of ['multi-node-failover', 'backup-restore']) {
    const matching = links.filter((link) => link.includes(category));
    if (matching.length === 0) {
      problems.push(
        `Readiness claim found but no linked evidence report for "${category}" — ` +
          `link a report under docs/deployment/evidence/${category}-*.md`,
      );
      continue;
    }
    const passing = matching.some((link) => {
      const content = readEvidenceFile(link);
      return content !== undefined && /Result: PASS/.test(content);
    });
    if (!passing) {
      problems.push(
        `Readiness claim found but no linked "${category}" evidence report is a passing, ` +
          `existing report (checked: ${matching.join(', ')})`,
      );
    }
  }

  return { ok: problems.length === 0, problems };
}

export function formatReport(problems) {
  return problems.map((problem) => `  - ${problem}`).join('\n');
}

async function main() {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const docsDirectory = join(scriptDirectory, '..', 'docs', 'deployment');
  const docPath = join(docsDirectory, 'enterprise-kubernetes.md');
  const docText = readFileSync(docPath, 'utf8');

  const { ok, problems } = validateReadinessGate(docText, (relativePath) => {
    const evidencePath = join(docsDirectory, relativePath);
    return existsSync(evidencePath) ? readFileSync(evidencePath, 'utf8') : undefined;
  });

  if (!ok) {
    process.stderr.write(
      `docs/deployment/enterprise-kubernetes.md failed the readiness-claim gate:\n${formatReport(problems)}\n`,
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write('docs/deployment/enterprise-kubernetes.md: readiness-claim gate OK.\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
