import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseAllDocuments } from 'yaml';

/**
 * The web role's Content Security Policy allows an external OIDC provider's
 * origin for sign-in, read from COPALIBRE_CSP_IDENTITY_ORIGIN. The chart sets
 * it explicitly or derives it from the issuer, and leaves it empty for the
 * built-in provider, whose origin the policy already allows as 'self'.
 */

const CHART_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'deploy',
  'helm',
  'copalibre',
);

function identityOrigin(setArgs) {
  const args = ['template', CHART_DIR, '--show-only', 'templates/web-deployment.yaml'];
  for (const [key, value] of setArgs) args.push('--set', `${key}=${value}`);
  const [deployment] = parseAllDocuments(execFileSync('helm', args, { encoding: 'utf8' })).map(
    (doc) => doc.toJS(),
  );
  const env = deployment.spec.template.spec.containers[0].env;
  const entries = env.filter((entry) => entry.name === 'COPALIBRE_CSP_IDENTITY_ORIGIN');
  assert.equal(entries.length, 1, 'the variable is rendered exactly once');
  return entries[0].value;
}

test('an external issuer contributes its origin, without the path', () => {
  assert.equal(
    identityOrigin([
      ['web.env.COPALIBRE_JWT_ISSUER', 'https://id.example/realms/copa'],
      ['env.COPALIBRE_APP_URL', 'https://app.example'],
    ]),
    'https://id.example',
  );
});

test('the built-in provider on the application origin adds nothing', () => {
  assert.equal(
    identityOrigin([
      ['web.env.COPALIBRE_JWT_ISSUER', 'https://app.example'],
      ['env.COPALIBRE_APP_URL', 'https://app.example/'],
    ]),
    '',
  );
});

test('an explicit value wins over the derived one', () => {
  assert.equal(
    identityOrigin([
      ['web.env.COPALIBRE_CSP_IDENTITY_ORIGIN', 'https://sso.example'],
      ['web.env.COPALIBRE_JWT_ISSUER', 'https://id.example'],
    ]),
    'https://sso.example',
  );
});

test('default values render it empty', () => {
  assert.equal(identityOrigin([]), '');
});
