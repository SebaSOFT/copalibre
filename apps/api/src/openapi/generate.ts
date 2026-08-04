import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { DATABASE } from '../database.token.js';
import type { OpenAPIObject } from '@nestjs/swagger';
import { OPENAPI_CONTROLLERS } from './generate-controllers.js';
import { TokenVerifier } from '../auth/token-verifier.js';
import { buildOpenApiDocument, OPENAPI_VERSION } from './document.js';
import { collectRoutePlanes } from './collect-planes.js';
import { lintOpenApiContract } from './contract-lint.js';
import { detectBreakingChanges } from './breaking-change.js';
import { formatArtifactSecurityFindings, scanOpenApiArtifact } from './artifact-security.js';
import { serializeOpenApiArtifact } from './artifact.js';
import { Module } from '@nestjs/common';

/**
 * Generates, lints, and breaking-change-checks the OpenAPI artifact.
 *
 * Runs against a module with stubbed infrastructure: generation must never need
 * a database or a reachable identity provider, so CI can produce the artifact
 * without provisioning either.
 */
const CONTROLLERS = OPENAPI_CONTROLLERS;

@Module({
  controllers: [...CONTROLLERS],
  providers: [
    { provide: DATABASE, useValue: {} },
    { provide: TokenVerifier, useValue: {} },
  ],
})
class OpenApiModule {}

// Tests may point generation at an isolated artifact. Production and CI retain
// the reviewed contracts path unless they explicitly opt into that override.
const ARTIFACT_PATH =
  process.env.COPALIBRE_OPENAPI_ARTIFACT_PATH ??
  join(import.meta.dirname, '../../../../packages/contracts/openapi/v1.json');

async function main(): Promise<void> {
  // Fastify adapter, matching production; generation needs no listening server.
  const app = await NestFactory.create(OpenApiModule, new FastifyAdapter(), {
    logger: ['error', 'warn'],
  });
  const document = buildOpenApiDocument(app);
  await app.close();
  const artifact = serializeOpenApiArtifact(document);

  const planes = collectRoutePlanes(CONTROLLERS);

  const findings = lintOpenApiContract(document, planes);
  if (findings.length > 0) {
    for (const finding of findings) {
      process.stderr.write(
        `contract-lint ${finding.rule}: ${finding.route}\n  ${finding.message}\n`,
      );
    }
    process.stderr.write(`\ncontract-lint failed with ${findings.length} finding(s)\n`);
    process.exitCode = 1;
    return;
  }

  if (existsSync(ARTIFACT_PATH)) {
    const previous = JSON.parse(readFileSync(ARTIFACT_PATH, 'utf8')) as OpenAPIObject;
    const breaking = detectBreakingChanges(previous, document);
    if (breaking.length > 0 && !process.argv.includes('--accept-breaking')) {
      for (const change of breaking) {
        process.stderr.write(
          `breaking-change ${change.kind}: ${change.location}\n  ${change.detail}\n`,
        );
      }
      process.stderr.write(
        `\n${breaking.length} breaking change(s) against the published artifact.\n` +
          'Bump OPENAPI_VERSION and re-run with --accept-breaking if this is intentional.\n',
      );
      process.exitCode = 1;
      return;
    }
  }

  const securityFindings = scanOpenApiArtifact(artifact);
  if (securityFindings.length > 0) {
    process.stderr.write(`${formatArtifactSecurityFindings(securityFindings)}\n`);
    process.stderr.write(
      `\nartifact-security failed with ${securityFindings.length} finding(s); remove secrets or internal addresses.\n`,
    );
    process.exitCode = 1;
    return;
  }

  mkdirSync(dirname(ARTIFACT_PATH), { recursive: true });
  writeFileSync(ARTIFACT_PATH, artifact);
  const routeCount = Object.keys(document.paths ?? {}).length;
  process.stdout.write(
    `openapi ${OPENAPI_VERSION}: ${routeCount} path(s), contract-lint clean -> ${ARTIFACT_PATH}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`openapi generation failed: ${String(error)}\n`);
  if (error instanceof Error && error.stack) process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
