import { DomainError } from '../errors.js';
import { err, ok, type Result } from '../result.js';
import {
  ACTOR_GRANULARITIES,
  COMPETITION_GRANULARITIES,
  isActorGranularity,
  isCompetitionGranularity,
  type ActorGranularity,
  type CompetitionGranularity,
} from './hierarchies.js';

/**
 * Tags: the same idea as a collector, for state that is not a number (0016).
 *
 * A collector answers "how many"; a tag answers "is this the case" — suspended,
 * injured, unregistered, cleared. Both are declared by a discipline or a
 * tournament, both are derived from facts rather than stored as flags, and both
 * accumulate at a granularity somebody chose.
 *
 * ## What a tag is not
 *
 * **A tag enforces nothing.** CopaLibre keeps two promises and no third: the
 * integrity of its own records, and what *this* organizer configured. It never
 * enforces what a sport usually requires. If a player must not take the field
 * after five reds, they carry a tag and the organizer keeps them out; nothing
 * here refuses the roster. A system that decided otherwise would be wrong the
 * first time a tribunal lifted a suspension on appeal, a friendly ignored the
 * league's discipline, or a discipline counted cards a way nobody anticipated —
 * and it would be wrong in the direction that stops a match being played.
 */

export type TagLifetime =
  /** Until somebody lifts it. The default: most tags are somebody's decision. */
  | { readonly kind: 'lifted' }
  /** Until the competition it was applied in ends — a stage, a season. */
  | { readonly kind: 'granularity-ends' }
  /** Until a collector reaches a value: "cleared after three matches played". */
  | {
      readonly kind: 'collector-reaches';
      readonly collectorCode: string;
      readonly value: number;
    };

export interface TagDeclaration {
  readonly code: string;
  readonly label: string;
  /** Which actor granularities may carry it; a person, a team, both. */
  readonly appliesTo: readonly ActorGranularity[];
  /** Which competition granularities it may be scoped to; absent means any. */
  readonly scopedTo?: readonly CompetitionGranularity[];
  /**
   * Where a fact produced from an event is scoped, when the discipline has an
   * opinion — "a red card suspends for the season" is a rule of the sport as
   * often as it is a rule of the tournament.
   *
   * A tournament may still say otherwise, and its choice wins: CopaLibre
   * enforces what *this* organizer configured, and a friendly that suspends for
   * one match is not a discipline getting it wrong.
   */
  readonly producedAt?: CompetitionGranularity;
  /**
   * Whether a second application may stand alongside the first. Exclusive tags
   * are states, not counters: "suspended" twice over is one suspension, and
   * treating it as two invents a lifting that nobody performed.
   */
  readonly exclusive?: boolean;
  readonly until?: TagLifetime;
}

/**
 * Application and lifting, both recorded as facts.
 *
 * Never a delete and never a flag: "was he suspended when that match was
 * played?" is a question a protest asks months later, and a row that was
 * removed cannot answer it.
 */
export interface TagFact {
  readonly code: string;
  readonly action: 'applied' | 'lifted';
  readonly actorGranularity: ActorGranularity;
  readonly actorId: string;
  readonly competitionGranularity: CompetitionGranularity;
  readonly competitionId: string;
  /** Who decided; `user:<id>` for a person, `script:<id>` for a declaration. */
  readonly actor: string;
  readonly reason: string;
  readonly at: string;
}

/** A tag that applies right now, with the facts that put it there. */
export interface AppliedTag {
  readonly code: string;
  readonly actorGranularity: ActorGranularity;
  readonly actorId: string;
  readonly competitionGranularity: CompetitionGranularity;
  readonly competitionId: string;
  readonly since: string;
  readonly appliedBy: string;
  readonly reason: string;
  /** Every fact about this tag and subject, newest last. */
  readonly facts: readonly TagFact[];
}

export class TagError extends DomainError {
  readonly code = 'TAG_INVALID';
}

/**
 * Validates every declaration a discipline makes, together — a duplicate
 * code is a relationship between two declarations, not a property of either
 * alone, the same reason `validateCollectors` checks its collectors together
 * (0073).
 */
export function validateTagDeclarations(
  declarations: readonly TagDeclaration[],
): Result<readonly TagDeclaration[], TagError> {
  const seen = new Set<string>();
  for (const declaration of declarations) {
    if (seen.has(declaration.code)) {
      return err(
        new TagError(`Tag "${declaration.code}" is declared more than once`, {
          code: declaration.code,
        }),
      );
    }
    seen.add(declaration.code);
    const validated = validateTagDeclaration(declaration);
    if (!validated.ok) return validated;
  }
  return ok(declarations);
}

/** Validates a declaration against the published hierarchies. */
export function validateTagDeclaration(
  declaration: TagDeclaration,
): Result<TagDeclaration, TagError> {
  if (declaration.appliesTo.length === 0) {
    return err(
      new TagError(`Tag "${declaration.code}" applies to nothing, so nothing could carry it`, {
        code: declaration.code,
      }),
    );
  }

  const unknownActor = declaration.appliesTo.find((one) => !isActorGranularity(one));
  if (unknownActor) {
    return err(
      new TagError(
        `Tag "${declaration.code}" names actor granularity "${unknownActor}". ` +
          `Published: ${ACTOR_GRANULARITIES.join(', ')}`,
        { code: declaration.code, granularity: unknownActor },
      ),
    );
  }

  const unknownScope = [
    ...(declaration.scopedTo ?? []),
    ...(declaration.producedAt === undefined ? [] : [declaration.producedAt]),
  ].find((one) => !isCompetitionGranularity(one));
  if (unknownScope) {
    return err(
      new TagError(
        `Tag "${declaration.code}" names competition granularity "${unknownScope}". ` +
          `Published: ${COMPETITION_GRANULARITIES.join(', ')}`,
        { code: declaration.code, granularity: unknownScope },
      ),
    );
  }

  if (
    declaration.producedAt !== undefined &&
    declaration.scopedTo &&
    !declaration.scopedTo.includes(declaration.producedAt)
  ) {
    return err(
      new TagError(
        `Tag "${declaration.code}" produces facts at ${declaration.producedAt}, which is not ` +
          `among the granularities it may be scoped to (${declaration.scopedTo.join(', ')})`,
        { code: declaration.code, granularity: declaration.producedAt },
      ),
    );
  }

  return ok(declaration);
}

/**
 * Where a fact produced from an event belongs.
 *
 * The tournament's choice wins over the discipline's, and neither is invented:
 * with nothing declared on either side there is no scope, and picking one would
 * file a suspension in a competition nobody named.
 */
export function tagScopeFor(
  declaration: TagDeclaration,
  configured?: CompetitionGranularity,
): CompetitionGranularity | undefined {
  return configured ?? declaration.producedAt;
}

/**
 * Whether an application may be recorded.
 *
 * The two refusals are about the *record*, never about the competition: a tag
 * on a granularity the declaration does not name is meaningless, and a second
 * concurrent application of an exclusive tag would need a lifting nobody
 * performed to explain it.
 */
export function checkTagApplication(
  declaration: TagDeclaration,
  fact: TagFact,
  standing: readonly AppliedTag[],
): Result<TagFact, TagError> {
  if (fact.code !== declaration.code) {
    return err(
      new TagError(`Fact names tag "${fact.code}" but was checked against "${declaration.code}"`, {
        code: fact.code,
      }),
    );
  }

  if (!declaration.appliesTo.includes(fact.actorGranularity)) {
    return err(
      new TagError(
        `Tag "${declaration.code}" does not apply to a ${fact.actorGranularity}; ` +
          `it applies to ${declaration.appliesTo.join(', ')}`,
        { code: declaration.code, granularity: fact.actorGranularity },
      ),
    );
  }

  if (declaration.scopedTo && !declaration.scopedTo.includes(fact.competitionGranularity)) {
    return err(
      new TagError(
        `Tag "${declaration.code}" cannot be scoped to a ${fact.competitionGranularity}; ` +
          `it is scoped to ${declaration.scopedTo.join(', ')}`,
        { code: declaration.code, granularity: fact.competitionGranularity },
      ),
    );
  }

  if (fact.reason.trim() === '') {
    return err(
      new TagError(`Tag "${declaration.code}" carries a reason: somebody decided this`, {
        code: declaration.code,
      }),
    );
  }

  if (
    declaration.exclusive === true &&
    fact.action === 'applied' &&
    standing.some((tag) => tag.code === fact.code && tag.actorId === fact.actorId)
  ) {
    return err(
      new TagError(
        `Tag "${declaration.code}" is exclusive and already applies to ${fact.actorId}`,
        { code: declaration.code, actorId: fact.actorId },
      ),
    );
  }

  return ok(fact);
}

export interface TagReadContext {
  /** Whether a competition at this granularity has finished. */
  readonly hasEnded?: (
    granularity: CompetitionGranularity,
    competitionId: string,
  ) => boolean | undefined;
  /** A collector's total for the subject, for a `collector-reaches` lifetime. */
  readonly totalOf?: (collectorCode: string, actorId: string) => number | undefined;
}

/**
 * Which tags apply, derived from the facts at read.
 *
 * Nothing is written to expire a tag. A stored flag would have to be cleared by
 * a job, and the day the job does not run is the day a cleared player reads as
 * suspended — with the record saying it was cleared and the screen saying it
 * was not.
 */
export function tagsAt(
  declarations: readonly TagDeclaration[],
  facts: readonly TagFact[],
  context: TagReadContext = {},
): readonly AppliedTag[] {
  const byCode = new Map(declarations.map((one) => [one.code, one]));
  const bySubject = new Map<string, TagFact[]>();

  for (const fact of [...facts].sort((left, right) => left.at.localeCompare(right.at))) {
    const key = subjectKey(fact);
    bySubject.set(key, [...(bySubject.get(key) ?? []), fact]);
  }

  const applied: AppliedTag[] = [];

  for (const history of bySubject.values()) {
    const last = history[history.length - 1];
    if (!last || last.action !== 'applied') continue;

    const declaration = byCode.get(last.code);
    if (!declaration) continue;
    if (expired(declaration, last, context)) continue;

    applied.push({
      code: last.code,
      actorGranularity: last.actorGranularity,
      actorId: last.actorId,
      competitionGranularity: last.competitionGranularity,
      competitionId: last.competitionId,
      since: last.at,
      appliedBy: last.actor,
      reason: last.reason,
      facts: history,
    });
  }

  return applied;
}

function expired(declaration: TagDeclaration, fact: TagFact, context: TagReadContext): boolean {
  const until = declaration.until;
  if (!until || until.kind === 'lifted') return false;

  if (until.kind === 'granularity-ends') {
    return context.hasEnded?.(fact.competitionGranularity, fact.competitionId) === true;
  }

  const total = context.totalOf?.(until.collectorCode, fact.actorId);
  return total !== undefined && total >= until.value;
}

function subjectKey(fact: TagFact): string {
  return [
    fact.code,
    fact.actorGranularity,
    fact.actorId,
    fact.competitionGranularity,
    fact.competitionId,
  ].join('|');
}
