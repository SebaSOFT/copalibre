import type { INestApplication } from '@nestjs/common';

/** Every API route lives here, so each proxy needs one rule for the whole API. */
export const API_PATH_PREFIX = 'api';

/** Shared by production, the OpenAPI generator and the test harness, so none of them can drift. */
export function applyApiPathPrefix(app: INestApplication): void {
  app.setGlobalPrefix(API_PATH_PREFIX);
}
