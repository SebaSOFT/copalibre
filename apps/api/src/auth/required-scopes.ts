import { SetMetadata } from '@nestjs/common';

export const REQUIRED_SCOPES_KEY = 'copalibre:required-scopes';

/** Replaces a security plane's coarse default for an explicitly exceptional route. */
export const RequireScopes = (...scopes: readonly string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_SCOPES_KEY, scopes);
