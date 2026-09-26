import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateDevCompose } from './check-dev-compose.mjs';

const VALID_FIXTURE = `
services:
  object-storage-init:
    build:
      dockerfile_inline: |
        FROM dxflrs/garage:v1.1.0 AS garage
        FROM alpine:3.21
        COPY --from=garage /garage /usr/local/bin/garage
    profiles:
      - infrastructure
    command: >
      /bin/sh -c "
      garage bucket create copalibre-dev &&
      tail -f /dev/null"
    healthcheck:
      test: ["CMD", "garage", "bucket", "info", "copalibre-dev"]
      interval: 2s
      timeout: 2s
      retries: 10
`;

test('valid dev compose passes validation', () => {
  const result = validateDevCompose(VALID_FIXTURE);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('missing object-storage-init service fails validation', () => {
  const yaml = `
services:
  postgres:
    image: postgres:17
`;
  const result = validateDevCompose(yaml);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('Missing service object-storage-init')));
});

test('object-storage-init missing infrastructure profile fails validation', () => {
  const yaml = `
services:
  object-storage-init:
    image: dxflrs/garage:v1.1.0
    command: tail -f /dev/null
    healthcheck:
      test: ["CMD", "true"]
`;
  const result = validateDevCompose(yaml);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('infrastructure profile')));
});

test('object-storage-init without keep-alive command fails validation', () => {
  const yaml = `
services:
  object-storage-init:
    profiles:
      - infrastructure
    command: /bin/sh -c "garage bucket create copalibre-dev"
    healthcheck:
      test: ["CMD", "true"]
`;
  const result = validateDevCompose(yaml);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('keep container alive')));
});

test('object-storage-init without healthcheck fails validation', () => {
  const yaml = `
services:
  object-storage-init:
    profiles:
      - infrastructure
    command: tail -f /dev/null
`;
  const result = validateDevCompose(yaml);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('define a healthcheck')));
});

test('actual docker-compose.dev.yml passes validation', () => {
  const filePath = new URL('../docker-compose.dev.yml', import.meta.url);
  const content = readFileSync(filePath, 'utf8');
  const result = validateDevCompose(content);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('actual docker-compose.dev.yml uses Garage and no longer references MinIO or mc', () => {
  const filePath = new URL('../docker-compose.dev.yml', import.meta.url);
  const content = readFileSync(filePath, 'utf8');
  assert.match(content, /dxflrs\/garage:v1\.1\.0/);
  assert.doesNotMatch(content, /quay\.io\/minio/);
  assert.doesNotMatch(content, /image:\s*minio/i);
});
