import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareEnvKeys,
  compareServices,
  isClean,
  formatReport,
} from './check-helm-compose-parity.mjs';

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

const FIXTURE_SERVICES_COMPOSE = `
services:
  api:
    environment: {}
  web-ssr:
    environment: {}
  web:
    environment: {}
  redis:
    profiles: ['optional-adapters']
`;

const FIXTURE_TEMPLATES = ['deployment.yaml', 'web-deployment.yaml', 'service.yaml'];

test('accepts a Compose service whose chart counterpart is a role', () => {
  const values = `
roles:
  api:
    port: 3001
  web-ssr:
    port: 3005
`;
  const services = compareServices(FIXTURE_SERVICES_COMPOSE, values, FIXTURE_TEMPLATES);
  assert.deepEqual(services.undecided, []);
  assert.deepEqual(services.unrendered, []);
  assert.deepEqual(services.rolesWithoutService, []);
});

test('catches a Compose service the chart never renders', () => {
  // The 0212 regression: web-ssr in docker-compose.yml, absent from the chart,
  // so the web role proxies to a host Kubernetes cannot resolve.
  const missingRole = `
roles:
  api:
    port: 3001
`;
  const services = compareServices(FIXTURE_SERVICES_COMPOSE, missingRole, FIXTURE_TEMPLATES);
  assert.deepEqual(services.unrendered, ["web-ssr: no 'web-ssr' entry in values.yaml roles"]);
  assert.equal(isClean(compareEnvKeys(FIXTURE_COMPOSE, FIXTURE_VALUES_MATCHING), services), false);
  assert.match(
    formatReport(compareEnvKeys(FIXTURE_COMPOSE, FIXTURE_VALUES_MATCHING), services),
    /web-ssr/,
  );
});

test('catches a Compose service nobody decided a counterpart for', () => {
  const withUnknown = `
services:
  api:
    environment: {}
  telemetry-sidecar:
    environment: {}
`;
  const services = compareServices(
    withUnknown,
    `roles:\n  api:\n    port: 3001\n`,
    FIXTURE_TEMPLATES,
  );
  assert.deepEqual(services.undecided, ['telemetry-sidecar']);
  assert.match(
    formatReport(compareEnvKeys(FIXTURE_COMPOSE, FIXTURE_VALUES_MATCHING), services),
    /SERVICE_COUNTERPARTS/,
  );
});

test('ignores a service that is only in an opt-in profile', () => {
  const services = compareServices(
    FIXTURE_SERVICES_COMPOSE,
    `roles:\n  api:\n    port: 3001\n  web-ssr:\n    port: 3005\n`,
    FIXTURE_TEMPLATES,
  );
  assert.equal(services.undecided.includes('redis'), false);
});

test('catches a chart role that no Compose service runs', () => {
  const extraRole = `
roles:
  api:
    port: 3001
  web-ssr:
    port: 3005
  ghost:
    port: 3099
`;
  const services = compareServices(FIXTURE_SERVICES_COMPOSE, extraRole, FIXTURE_TEMPLATES);
  assert.deepEqual(services.rolesWithoutService, ['ghost']);
});
