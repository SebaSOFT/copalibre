import {
  normaliseEmail,
  type IdentityPrincipal,
  type ParticipantIdentityLink,
} from '@copalibre/domain';
import type { Kysely } from 'kysely';
import { InvariantViolationError, NotFoundError } from '../errors.js';
import { newId } from '../ids.js';
import { toIdentityPrincipal } from '../mapping.js';
import type { Database } from '../schema.js';
import type { UnitOfWork } from '../transaction.js';
import { SYSTEM_ORGANIZATION } from '../relay/scheduled-jobs.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface OidcIdentity {
  readonly subjectId: string;
  readonly verifiedEmail: string;
  readonly name?: string;
  readonly picture?: string;
}

/** Maps replaceable OIDC credentials onto installation-owned UUIDv7 principals. */
export class IdentityPrincipalRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async findByEmail(email: string): Promise<IdentityPrincipal | undefined> {
    const row = await this.db
      .selectFrom('identity_principals')
      .selectAll()
      .where('email', '=', normaliseEmail(email))
      .executeTakeFirst();
    return row ? toIdentityPrincipal(row) : undefined;
  }

  async create(
    uow: UnitOfWork,
    input: {
      readonly email: string;
      readonly passwordHash?: string;
      readonly name?: string;
      readonly picture?: string;
      readonly actor?: string;
      readonly authorizationContext?: string;
    },
  ): Promise<IdentityPrincipal> {
    const email = normaliseEmail(input.email);
    const existing = await uow.tx
      .selectFrom('identity_principals')
      .selectAll()
      .where('email', '=', email)
      .executeTakeFirst();

    if (existing) {
      throw new InvariantViolationError('Email is already registered');
    }

    const principalId = newId();
    const row = await uow.tx
      .insertInto('identity_principals')
      .values({
        principal_id: principalId,
        oidc_subject_id: principalId,
        email,
        password_hash: input.passwordHash ?? null,
        name: input.name ?? null,
        picture: input.picture ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const principal = toIdentityPrincipal(row);
    await uow.recordAudit({
      organizationId: SYSTEM_ORGANIZATION,
      entityType: 'identity-principal',
      entityId: principal.principalId,
      action: 'identity.principal-registered',
      actor: input.actor ?? `principal:${principal.principalId}`,
      authorizationContext: input.authorizationContext ?? 'self-service:signup',
      resultingState: { email },
    });
    return principal;
  }

  async findByOidcSubject(subjectId: string): Promise<IdentityPrincipal | undefined> {
    const isUuid = UUID_PATTERN.test(subjectId);
    const row = await this.db
      .selectFrom('identity_principals')
      .selectAll()
      .where((eb) => {
        const conditions = [eb('oidc_subject_id', '=', subjectId)];
        if (isUuid) {
          conditions.push(eb('principal_id', '=', subjectId));
        }
        return eb.or(conditions);
      })
      .executeTakeFirst();
    return row ? toIdentityPrincipal(row) : undefined;
  }

  async findParticipantByOidcSubject(
    organizationId: string,
    subjectId: string,
  ): Promise<ParticipantIdentityLink | undefined> {
    const isUuid = UUID_PATTERN.test(subjectId);
    const row = await this.db
      .selectFrom('participant_identity_links')
      .innerJoin(
        'identity_principals',
        'identity_principals.principal_id',
        'participant_identity_links.principal_id',
      )
      .select([
        'participant_identity_links.principal_id as principal_id',
        'participant_identity_links.organization_id as organization_id',
        'participant_identity_links.person_id as person_id',
      ])
      .where('participant_identity_links.organization_id', '=', organizationId)
      .where((eb) => {
        const conditions = [eb('identity_principals.oidc_subject_id', '=', subjectId)];
        if (isUuid) {
          conditions.push(eb('identity_principals.principal_id', '=', subjectId));
        }
        return eb.or(conditions);
      })
      .executeTakeFirst();
    return row
      ? {
          principalId: row.principal_id,
          organizationId: row.organization_id,
          personId: row.person_id,
        }
      : undefined;
  }

  /** Which of these persons already carry an identity link — for a list screen's per-row action gate. */
  async linkedPersonIds(
    organizationId: string,
    personIds: readonly string[],
  ): Promise<ReadonlySet<string>> {
    if (personIds.length === 0) return new Set();
    const rows = await this.db
      .selectFrom('participant_identity_links')
      .select('person_id')
      .where('organization_id', '=', organizationId)
      .where('person_id', 'in', personIds)
      .execute();
    return new Set(rows.map((row) => row.person_id));
  }

  /** Admins may pre-link a participant before their first OIDC login. */
  async linkParticipant(
    uow: UnitOfWork,
    input: {
      readonly organizationId: string;
      readonly personId: string;
      readonly email: string;
      readonly actor: string;
      readonly authorizationContext: string;
    },
  ): Promise<ParticipantIdentityLink> {
    const person = await uow.tx
      .selectFrom('persons')
      .select(['person_id', 'organization_id'])
      .where('person_id', '=', input.personId)
      .executeTakeFirst();
    if (!person || person.organization_id !== input.organizationId) {
      throw new NotFoundError('Participant does not belong to this organization');
    }

    const principal = await this.findOrCreateByEmail(uow, normaliseEmail(input.email));
    const existing = await uow.tx
      .selectFrom('participant_identity_links')
      .selectAll()
      .where('organization_id', '=', input.organizationId)
      .where('person_id', '=', input.personId)
      .executeTakeFirst();
    if (existing && existing.principal_id !== principal.principalId) {
      throw new InvariantViolationError('Participant is already linked to another principal');
    }

    if (!existing) {
      await uow.tx
        .insertInto('participant_identity_links')
        .values({
          principal_id: principal.principalId,
          organization_id: input.organizationId,
          person_id: input.personId,
          created_at: new Date(),
          created_by: input.actor,
        })
        .execute();
      await uow.recordAudit({
        organizationId: input.organizationId,
        entityType: 'participant-identity-link',
        entityId: principal.principalId,
        action: 'participant.identity-linked',
        actor: input.actor,
        authorizationContext: input.authorizationContext,
        resultingState: { principalId: principal.principalId, personId: input.personId },
      });
    }

    return {
      principalId: principal.principalId,
      organizationId: input.organizationId,
      personId: input.personId,
    };
  }

  /**
   * Removes a participant identity link, freeing the person to be linked
   * again — a hard delete, following `PersonRepository.dismiss`'s shape for a
   * row nothing downstream foreign-keys against. Unlike `dismiss`, a missing
   * link is refused rather than silently accepted: an unlink attempted
   * against a person with no link is a genuine input error worth naming,
   * where `dismiss`'s no-op guards against an already-processed retry.
   */
  async unlinkParticipant(
    uow: UnitOfWork,
    input: {
      readonly organizationId: string;
      readonly personId: string;
      readonly actor: string;
      readonly authorizationContext: string;
    },
  ): Promise<ParticipantIdentityLink> {
    const existing = await uow.tx
      .selectFrom('participant_identity_links')
      .selectAll()
      .where('organization_id', '=', input.organizationId)
      .where('person_id', '=', input.personId)
      .executeTakeFirst();
    if (!existing) {
      throw new NotFoundError('This participant has no identity link to remove', {
        personId: input.personId,
      });
    }

    await uow.tx
      .deleteFrom('participant_identity_links')
      .where('organization_id', '=', input.organizationId)
      .where('person_id', '=', input.personId)
      .execute();

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'participant-identity-link',
      entityId: existing.principal_id,
      action: 'participant.identity-unlinked',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { principalId: existing.principal_id, personId: input.personId },
    });

    return {
      principalId: existing.principal_id,
      organizationId: input.organizationId,
      personId: input.personId,
    };
  }

  /** Ensures exactly one principal exists for verified OIDC identity and email. */
  async bindVerifiedOidcIdentity(
    uow: UnitOfWork,
    identity: OidcIdentity,
  ): Promise<IdentityPrincipal> {
    const email = normaliseEmail(identity.verifiedEmail);
    const bySubject = await uow.tx
      .selectFrom('identity_principals')
      .selectAll()
      .where('oidc_subject_id', '=', identity.subjectId)
      .executeTakeFirst();
    if (bySubject) {
      if (bySubject.email !== email) {
        throw new InvariantViolationError(
          'OIDC subject email does not match its established principal',
        );
      }
      const updated = await uow.tx
        .updateTable('identity_principals')
        .set({
          ...(identity.name === undefined ? {} : { name: identity.name }),
          ...(identity.picture === undefined ? {} : { picture: identity.picture }),
          updated_at: new Date(),
        })
        .where('principal_id', '=', bySubject.principal_id)
        .returningAll()
        .executeTakeFirstOrThrow();
      return toIdentityPrincipal(updated);
    }

    const byEmail = await uow.tx
      .selectFrom('identity_principals')
      .selectAll()
      .where('email', '=', email)
      .executeTakeFirst();
    if (byEmail?.oidc_subject_id && byEmail.oidc_subject_id !== identity.subjectId) {
      throw new InvariantViolationError('Email is already bound to another OIDC subject');
    }
    if (byEmail) {
      const updated = await uow.tx
        .updateTable('identity_principals')
        .set({
          oidc_subject_id: identity.subjectId,
          ...(identity.name === undefined ? {} : { name: identity.name }),
          ...(identity.picture === undefined ? {} : { picture: identity.picture }),
          updated_at: new Date(),
        })
        .where('principal_id', '=', byEmail.principal_id)
        .returningAll()
        .executeTakeFirstOrThrow();
      return toIdentityPrincipal(updated);
    }

    const created = await uow.tx
      .insertInto('identity_principals')
      .values({
        principal_id: newId(),
        email,
        oidc_subject_id: identity.subjectId,
        name: identity.name ?? null,
        picture: identity.picture ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    const principal = toIdentityPrincipal(created);
    await uow.recordAudit({
      organizationId: SYSTEM_ORGANIZATION,
      entityType: 'identity-principal',
      entityId: principal.principalId,
      action: 'identity.principal-registered',
      actor: `principal:${principal.principalId}`,
      authorizationContext: 'self-service:oidc-first-login',
      resultingState: { email },
    });
    return principal;
  }

  private async findOrCreateByEmail(uow: UnitOfWork, email: string): Promise<IdentityPrincipal> {
    const existing = await uow.tx
      .selectFrom('identity_principals')
      .selectAll()
      .where('email', '=', email)
      .executeTakeFirst();
    if (existing) return toIdentityPrincipal(existing);
    const row = await uow.tx
      .insertInto('identity_principals')
      .values({
        principal_id: newId(),
        email,
        oidc_subject_id: null,
        name: null,
        picture: null,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toIdentityPrincipal(row);
  }
}
