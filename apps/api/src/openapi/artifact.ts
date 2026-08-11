import type { OpenAPIObject } from '@nestjs/swagger';

/** Serializes the reviewed OpenAPI contract in the exact form committed to disk. */
export function serializeOpenApiArtifact(document: OpenAPIObject): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}
