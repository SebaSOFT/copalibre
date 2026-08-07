import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareEnvKeys, isClean, formatReport } from './check-helm-compose-parity.mjs';

const FIXTURE_COMPOSE = `
x-application-environment: &application-environment
  DATABASE_URL: postgres://x
  COPALIBRE_APP_URL: http://x
services:
  api:
    environment:
      <<: *application-environment
      PRODUCT_ROLE: api
  web:
    environment:
      COPALIBRE_JWT_ISSUER: x
      COPALIBRE_OIDC_CLIENT_ID: x
`;

const FIXTURE_VALUES_MATCHING = `
env:
  DATABASE_URL: ''
  COPALIBRE_APP_URL: ''
web:
  env:
    COPALIBRE_JWT_ISSUER: ''
    COPALIBRE_OIDC_CLIENT_ID: ''
`;

test('reports clean parity when both files agree', () => {
  const diff = compareEnvKeys(FIXTURE_COMPOSE, FIXTURE_VALUES_MATCHING);
  assert.equal(isClean(diff), true);
  assert.equal(formatReport(diff), '');
});

test('catches a shared variable missing from values.yaml', () => {
  const missingFromValues = `
env:
  DATABASE_URL: ''
web:
  env:
    COPALIBRE_JWT_ISSUER: ''
    COPALIBRE_OIDC_CLIENT_ID: ''
`;
  const diff = compareEnvKeys(FIXTURE_COMPOSE, missingFromValues);
  assert.equal(isClean(diff), false);
  assert.deepEqual(diff.shared.onlyInCompose, ['COPALIBRE_APP_URL']);
  assert.match(formatReport(diff), /COPALIBRE_APP_URL/);
});

test('catches a K3s-only variable with no docker-compose.yml counterpart', () => {
  const extraInValues = `
env:
  DATABASE_URL: ''
  COPALIBRE_APP_URL: ''
  COPALIBRE_K3S_ONLY: ''
web:
  env:
    COPALIBRE_JWT_ISSUER: ''
    COPALIBRE_OIDC_CLIENT_ID: ''
`;
  const diff = compareEnvKeys(FIXTURE_COMPOSE, extraInValues);
  assert.equal(isClean(diff), false);
  assert.deepEqual(diff.shared.onlyInValues, ['COPALIBRE_K3S_ONLY']);
});

test('catches a web-only variable mismatch independently from the shared set', () => {
  const webMismatch = `
env:
  DATABASE_URL: ''
  COPALIBRE_APP_URL: ''
web:
  env:
    COPALIBRE_JWT_ISSUER: ''
`;
  const diff = compareEnvKeys(FIXTURE_COMPOSE, webMismatch);
  assert.equal(isClean(diff), false);
  assert.deepEqual(diff.shared.onlyInCompose, []);
  assert.deepEqual(diff.web.onlyInCompose, ['COPALIBRE_OIDC_CLIENT_ID']);
});
