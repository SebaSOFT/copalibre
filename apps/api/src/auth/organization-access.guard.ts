import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  IdentityPrincipalRepository,
  OrganizationAccessRepository,
  OrganizationRepository,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { DATABASE } from '../database.token.js';
import type { RequestWithSubject } from './request-context.js';
import {
  ACCESS_REQUIREMENT_KEY,
  SUPER_ADMIN_SCOPE,
  type AccessRequirement,
} from './access-requirement.js';
import { SECURITY_PLANE_KEY, type SecurityPlane } from './security-plane.js';

/**
 * Authorization after JwtAuthGuard verifies a token. Public reads bypass it;
 * every authenticated route must explicitly declare either an organization role
 * or installation-level super-admin requirement. Missing metadata denies.
 */
@Injectable()
export class OrganizationAccessGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(DATABASE) private readonly db: Kysely<Database>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const plane = this.reflector.getAllAndOverride<SecurityPlane>(SECURITY_PLANE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (plane === 'public-read') return true;

    const requirement = this.reflector.getAllAndOverride<AccessRequirement>(
      ACCESS_REQUIREMENT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requirement) {
      throw new ForbiddenException('Authenticated route has no access requirement');
    }

    const request = context
      .switchToHttp()
      .getRequest<RequestWithSubject & { params?: Record<string, string> }>();
    const subject = request.subject;
    if (!subject)
      throw new ForbiddenException('Authenticated route reached without a verified subject');

    if (requirement.kind === 'super-admin') {
      if (!subject.scopes.includes(SUPER_ADMIN_SCOPE)) {
        throw new ForbiddenException('Installation super-admin authority is required');
      }
      return true;
    }
    if (requirement.kind === 'invitation-acceptance') return true;

    const organizationId = await this.resolveOrganizationId(
      request.params?.organizationAlias,
      subject.organizationId,
    );
    if (!organizationId) {
      throw new ForbiddenException('Requested organization does not exist');
    }

    if (
      requirement.kind === 'organization-bootstrap-or-admin' &&
      subject.scopes.includes(SUPER_ADMIN_SCOPE)
    ) {
      const access = new OrganizationAccessRepository(this.db);
      if (!(await access.hasAnyAssignment(organizationId))) return true;
    }

    if (subject.organizationId !== organizationId) {
      throw new ForbiddenException('Subject is not scoped to this organization');
    }

    const identities = new IdentityPrincipalRepository(this.db);
    if (requirement.kind === 'participant-self-service') {
      const link = await identities.findParticipantByOidcSubject(organizationId, subject.subjectId);
      if (!link)
        throw new ForbiddenException('Subject has no participant identity in this organization');
      request.subject = {
        ...subject,
        principalId: link.principalId,
        participantPersonId: link.personId,
      };
      return true;
    }

    if (requirement.kind === 'organization-bootstrap-or-admin') {
      const access = new OrganizationAccessRepository(this.db);
      const principal = await identities.findByOidcSubject(subject.subjectId);
      if (!principal) throw new ForbiddenException('Subject has no installation principal');
      request.subject = { ...subject, principalId: principal.principalId };
      const assignment = await access.findAssignment(organizationId, principal.principalId);
      if (!assignment || assignment.status !== 'active' || assignment.role !== 'admin') {
        throw new ForbiddenException('Subject has no active organization admin role');
      }
      return true;
    }

    const principal = await identities.findByOidcSubject(subject.subjectId);
    if (!principal) throw new ForbiddenException('Subject has no installation principal');
    request.subject = { ...subject, principalId: principal.principalId };

    const assignment = await new OrganizationAccessRepository(this.db).findAssignment(
      organizationId,
      principal.principalId,
    );
    if (!assignment || assignment.status !== 'active') {
      throw new ForbiddenException('Subject has no active organization role');
    }
    if (!requirement.roles.includes(assignment.role)) {
      throw new ForbiddenException('Subject organization role is not authorized for this route');
    }
    return true;
  }

  private async resolveOrganizationId(
    organizationAlias: string | undefined,
    subjectOrganizationId: string | undefined,
  ): Promise<string | undefined> {
    if (!organizationAlias) return subjectOrganizationId;
    return new OrganizationRepository(this.db)
      .findByAlias(organizationAlias)
      .then((row) => row?.organizationId);
  }
}
