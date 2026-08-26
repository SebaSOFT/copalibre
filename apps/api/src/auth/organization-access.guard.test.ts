import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { jest } from '@jest/globals';
import {
  IdentityPrincipalRepository,
  OrganizationAccessRepository,
  OrganizationRepository,
  type Database,
} from '@copalibre/persistence';
import type { ExecutionContext } from '@nestjs/common';
import { ACCESS_REQUIREMENT_KEY, SUPER_ADMIN_SCOPE } from './access-requirement.js';
import { OrganizationAccessGuard } from './organization-access.guard.js';
import type { RequestWithSubject } from './request-context.js';
import { SECURITY_PLANE_KEY } from './security-plane.js';

const handler = () => undefined;
const controller = class Controller {};

describe('OrganizationAccessGuard', () => {
  const reflector = new Reflector();

  beforeEach(() => {
    Reflect.defineMetadata(SECURITY_PLANE_KEY, 'admin-control', handler);
    Reflect.defineMetadata(
      ACCESS_REQUIREMENT_KEY,
      { kind: 'organization-role', roles: ['admin'] },
      handler,
    );
    jest.spyOn(OrganizationRepository.prototype, 'findByAlias').mockResolvedValue({
      organizationId: 'org-b',
      alias: 'org-b',
      name: 'Organization B',
      primaryLanguage: 'es',
      timezone: 'UTC',
    });
    jest.spyOn(IdentityPrincipalRepository.prototype, 'findByOidcSubject').mockResolvedValue({
      principalId: '01800000-0000-7000-8000-000000000001',
      email: 'admin@example.test',
      oidcSubjectId: 'oidc-admin',
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('does not grant organization B access from an admin assignment in organization A', async () => {
    const findAssignment = jest
      .spyOn(OrganizationAccessRepository.prototype, 'findAssignment')
      .mockImplementation(async (organizationId) =>
        organizationId === 'org-a'
          ? {
              assignmentId: '01800000-0000-7000-8000-000000000002',
              organizationId: 'org-a',
              principalId: '01800000-0000-7000-8000-000000000001',
              email: 'admin@example.test',
              role: 'admin',
              status: 'active',
            }
          : undefined,
      );
    const request: RequestWithSubject & { params: Record<string, string> } = {
      headers: {},
      params: { organizationAlias: 'org-b' },
      subject: {
        subjectId: 'oidc-admin',
        organizationId: 'org-b',
        scopes: ['copalibre.control'],
      },
    };
    const guard = new OrganizationAccessGuard(reflector, {} as Database as never);

    await expect(guard.canActivate(contextFor(request))).rejects.toThrow(ForbiddenException);
    expect(findAssignment).toHaveBeenCalledWith('org-b', '01800000-0000-7000-8000-000000000001');
  });

  it('accepts only an active assignment in the requested organization', async () => {
    jest.spyOn(OrganizationAccessRepository.prototype, 'findAssignment').mockResolvedValue({
      assignmentId: '01800000-0000-7000-8000-000000000002',
      organizationId: 'org-b',
      principalId: '01800000-0000-7000-8000-000000000001',
      email: 'admin@example.test',
      role: 'admin',
      status: 'active',
    });
    const request: RequestWithSubject & { params: Record<string, string> } = {
      headers: {},
      params: { organizationAlias: 'org-b' },
      subject: {
        subjectId: 'oidc-admin',
        organizationId: 'org-b',
        scopes: ['copalibre.control'],
      },
    };
    const guard = new OrganizationAccessGuard(reflector, {} as Database as never);

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.subject?.principalId).toBe('01800000-0000-7000-8000-000000000001');
  });

  it('does not reopen organization bootstrap after a historical soft-deleted assignment', async () => {
    Reflect.defineMetadata(
      ACCESS_REQUIREMENT_KEY,
      { kind: 'organization-bootstrap-or-admin' },
      handler,
    );
    const hasAnyAssignment = jest
      .spyOn(OrganizationAccessRepository.prototype, 'hasAnyAssignment')
      .mockResolvedValue(true);
    jest
      .spyOn(OrganizationAccessRepository.prototype, 'findAssignment')
      .mockResolvedValue(undefined);
    const request: RequestWithSubject & { params: Record<string, string> } = {
      headers: {},
      params: { organizationAlias: 'org-b' },
      subject: {
        subjectId: 'oidc-super-admin',
        organizationId: 'org-b',
        scopes: [SUPER_ADMIN_SCOPE],
      },
    };
    const guard = new OrganizationAccessGuard(reflector, {} as Database as never);

    await expect(guard.canActivate(contextFor(request))).rejects.toThrow(ForbiddenException);
    expect(hasAnyAssignment).toHaveBeenCalledWith('org-b');
  });

  it('bypasses authorization only for public reads and invitation acceptance', async () => {
    Reflect.defineMetadata(SECURITY_PLANE_KEY, 'public-read', handler);
    const publicRequest: RequestWithSubject = { headers: {} };
    const guard = new OrganizationAccessGuard(reflector, {} as Database as never);
    await expect(guard.canActivate(contextFor(publicRequest))).resolves.toBe(true);

    Reflect.defineMetadata(SECURITY_PLANE_KEY, 'authenticated-interaction', handler);
    Reflect.defineMetadata(ACCESS_REQUIREMENT_KEY, { kind: 'invitation-acceptance' }, handler);
    const invitationRequest: RequestWithSubject = {
      headers: {},
      subject: { subjectId: 'oidc-invite', scopes: ['copalibre.invite.accept'] },
    };
    await expect(guard.canActivate(contextFor(invitationRequest))).resolves.toBe(true);
  });

  it('requires the installation scope for a super-admin route', async () => {
    Reflect.defineMetadata(ACCESS_REQUIREMENT_KEY, { kind: 'super-admin' }, handler);
    const guard = new OrganizationAccessGuard(reflector, {} as Database as never);
    await expect(
      guard.canActivate(
        contextFor({ headers: {}, subject: { subjectId: 'super', scopes: [SUPER_ADMIN_SCOPE] } }),
      ),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(contextFor({ headers: {}, subject: { subjectId: 'user', scopes: [] } })),
    ).rejects.toThrow('Installation super-admin authority is required');
  });

  it('permits initial super-admin bootstrap but requires an explicit participant identity link', async () => {
    Reflect.defineMetadata(
      ACCESS_REQUIREMENT_KEY,
      { kind: 'organization-bootstrap-or-admin' },
      handler,
    );
    jest.spyOn(OrganizationAccessRepository.prototype, 'hasAnyAssignment').mockResolvedValue(false);
    const guard = new OrganizationAccessGuard(reflector, {} as Database as never);
    await expect(
      guard.canActivate(
        contextFor({
          headers: {},
          params: { organizationAlias: 'org-b' },
          subject: {
            subjectId: 'super',
            organizationId: 'org-b',
            scopes: [SUPER_ADMIN_SCOPE],
          },
        }),
      ),
    ).resolves.toBe(true);

    Reflect.defineMetadata(ACCESS_REQUIREMENT_KEY, { kind: 'participant-self-service' }, handler);
    jest
      .spyOn(IdentityPrincipalRepository.prototype, 'findParticipantByOidcSubject')
      .mockResolvedValue({
        principalId: '01800000-0000-7000-8000-000000000001',
        organizationId: 'org-b',
        personId: '01800000-0000-7000-8000-000000000003',
      });
    const participantRequest: RequestWithSubject & { params: Record<string, string> } = {
      headers: {},
      params: { organizationAlias: 'org-b' },
      subject: { subjectId: 'oidc-player', organizationId: 'org-b', scopes: [] },
    };
    await expect(guard.canActivate(contextFor(participantRequest))).resolves.toBe(true);
    expect(participantRequest.subject?.participantPersonId).toBe(
      '01800000-0000-7000-8000-000000000003',
    );
  });

  it('resolves the caller principal for a "self" route with no organization param', async () => {
    Reflect.defineMetadata(ACCESS_REQUIREMENT_KEY, { kind: 'self' }, handler);
    const guard = new OrganizationAccessGuard(reflector, {} as Database as never);
    const request: RequestWithSubject = {
      headers: {},
      subject: { subjectId: 'oidc-admin', scopes: ['copalibre.control'] },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.subject?.principalId).toBe('01800000-0000-7000-8000-000000000001');
  });

  it('leaves principalId unset for a "self" route when no installation principal exists yet', async () => {
    jest
      .spyOn(IdentityPrincipalRepository.prototype, 'findByOidcSubject')
      .mockResolvedValue(undefined);
    Reflect.defineMetadata(ACCESS_REQUIREMENT_KEY, { kind: 'self' }, handler);
    const guard = new OrganizationAccessGuard(reflector, {} as Database as never);
    const request: RequestWithSubject = {
      headers: {},
      subject: { subjectId: 'oidc-unknown', scopes: ['copalibre.control'] },
    };

    // A caller who authenticated but never accepted an invitation is not
    // refused: this route's whole point is answering "zero organizations",
    // and that is a 200 with an empty list, not a 403.
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.subject?.principalId).toBeUndefined();
  });

  it('rejects an active member whose role is not accepted by the route', async () => {
    jest.spyOn(OrganizationAccessRepository.prototype, 'findAssignment').mockResolvedValue({
      assignmentId: '01800000-0000-7000-8000-000000000002',
      organizationId: 'org-b',
      principalId: '01800000-0000-7000-8000-000000000001',
      email: 'viewer@example.test',
      role: 'viewer',
      status: 'active',
    });
    const guard = new OrganizationAccessGuard(reflector, {} as Database as never);
    await expect(
      guard.canActivate(
        contextFor({
          headers: {},
          params: { organizationAlias: 'org-b' },
          subject: { subjectId: 'oidc-viewer', organizationId: 'org-b', scopes: [] },
        }),
      ),
    ).rejects.toThrow('Subject organization role is not authorized');
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
