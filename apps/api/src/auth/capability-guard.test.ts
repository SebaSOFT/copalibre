import { Reflector } from '@nestjs/core';
import { jest } from '@jest/globals';
import {
  IdentityPrincipalRepository,
  OrganizationAccessRepository,
  OrganizationRepository,
  type Database,
} from '@copalibre/persistence';
import type { ExecutionContext } from '@nestjs/common';
import { ACCESS_REQUIREMENT_KEY } from './access-requirement.js';
import { OrganizationAccessGuard } from './organization-access.guard.js';
import type { RequestWithSubject } from './request-context.js';
import { SECURITY_PLANE_KEY } from './security-plane.js';

const handler = () => undefined;
const controller = class Controller {};

/**
 * `RequireOrganizationCapability` resolves through `rolesForCapability`
 * rather than naming roles directly (task 2.1). This asserts the
 * `organization-capability` requirement kind admits and refuses exactly the
 * roles the equivalent `organization-role` requirement would, for the same
 * assignment — the guard's own behavior mirrors what
 * `capability-guard-equivalence.test.ts` already checked at the metadata
 * level, before any real controller guard is converted.
 */
describe('OrganizationAccessGuard — organization-capability requirement', () => {
  const reflector = new Reflector();

  beforeEach(() => {
    Reflect.defineMetadata(SECURITY_PLANE_KEY, 'admin-control', handler);
    jest.spyOn(OrganizationRepository.prototype, 'findByAlias').mockResolvedValue({
      organizationId: 'org-b',
      alias: 'org-b',
      name: 'Organization B',
      primaryLanguage: 'es',
      timezone: 'UTC',
    });
    jest.spyOn(IdentityPrincipalRepository.prototype, 'findByOidcSubject').mockResolvedValue({
      principalId: '01800000-0000-7000-8000-000000000001',
      email: 'member@example.test',
      oidcSubjectId: 'oidc-subject',
    });
  });

  afterEach(() => jest.restoreAllMocks());

  function assignmentFor(role: string) {
    return {
      assignmentId: '01800000-0000-7000-8000-000000000002',
      organizationId: 'org-b',
      principalId: '01800000-0000-7000-8000-000000000001',
      email: 'member@example.test',
      role: role as never,
      status: 'active' as const,
    };
  }

  function requestFor(): RequestWithSubject & { params: Record<string, string> } {
    return {
      headers: {},
      params: { organizationAlias: 'org-b' },
      subject: { subjectId: 'oidc-subject', organizationId: 'org-b', scopes: [] },
    };
  }

  it('admits every role `org.manage-clubs` resolves to, exactly like the role-listing requirement would', async () => {
    Reflect.defineMetadata(
      ACCESS_REQUIREMENT_KEY,
      { kind: 'organization-capability', capability: 'org.manage-clubs' },
      handler,
    );
    const guard = new OrganizationAccessGuard(reflector, {} as Database as never);

    for (const role of ['admin', 'club-admin']) {
      jest
        .spyOn(OrganizationAccessRepository.prototype, 'findAssignment')
        .mockResolvedValue(assignmentFor(role));
      await expect(guard.canActivate(contextFor(requestFor()))).resolves.toBe(true);
    }
  });

  it('refuses every role `org.manage-clubs` does not resolve to, exactly like the role-listing requirement would', async () => {
    Reflect.defineMetadata(
      ACCESS_REQUIREMENT_KEY,
      { kind: 'organization-capability', capability: 'org.manage-clubs' },
      handler,
    );
    const guard = new OrganizationAccessGuard(reflector, {} as Database as never);

    for (const role of ['viewer', 'referee', 'broadcaster', 'tournament-admin']) {
      jest
        .spyOn(OrganizationAccessRepository.prototype, 'findAssignment')
        .mockResolvedValue(assignmentFor(role));
      await expect(guard.canActivate(contextFor(requestFor()))).rejects.toThrow(
        'Subject organization role is not authorized',
      );
    }
  });

  it('admits admin and referee, and only those, for `org.operate-match`', async () => {
    Reflect.defineMetadata(
      ACCESS_REQUIREMENT_KEY,
      { kind: 'organization-capability', capability: 'org.operate-match' },
      handler,
    );
    const guard = new OrganizationAccessGuard(reflector, {} as Database as never);

    for (const role of ['admin', 'referee', 'tournament-admin']) {
      jest
        .spyOn(OrganizationAccessRepository.prototype, 'findAssignment')
        .mockResolvedValue(assignmentFor(role));
      await expect(guard.canActivate(contextFor(requestFor()))).resolves.toBe(true);
    }

    for (const role of ['club-admin', 'viewer', 'broadcaster']) {
      jest
        .spyOn(OrganizationAccessRepository.prototype, 'findAssignment')
        .mockResolvedValue(assignmentFor(role));
      await expect(guard.canActivate(contextFor(requestFor()))).rejects.toThrow(
        'Subject organization role is not authorized',
      );
    }
  });
});

function contextFor(
  request: RequestWithSubject & { readonly params?: Record<string, string> },
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}
