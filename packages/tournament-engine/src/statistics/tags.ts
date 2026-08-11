import { tagScopeFor } from '@copalibre/domain';
import type {
  ActorGranularity,
  CompetitionGranularity,
  EventDefinition,
  RecordedEvent,
  TagDeclaration,
  TagFact,
} from '@copalibre/domain';
import type { ActorContext, CompetitionContext } from './fold.js';

/**
 * Tag facts produced by recorded events (0016).
 *
 * A discipline that says "an expulsion marks the player" declares it as an
 * `EventEffect`, and the fact this produces is the same shape an operator's
 * decision produces — so the read path has one kind of fact to fold and the
 * console shows one history, not two lists that have to be merged.
 *
 * Producing a fact is all this does. Nothing here refuses a roster, a match or
 * a result: the tag says what is the case, and the organizer decides.
 */

export interface TagEventInput {
  readonly declarations: readonly TagDeclaration[];
  readonly events: readonly RecordedEvent[];
  readonly definitions: readonly EventDefinition[];
  readonly actorOf: (entrantId: string) => ActorContext | undefined;
  readonly context: CompetitionContext;
  /**
   * Where facts produced here are scoped, when the tournament has configured it.
   *
   * Optional because the discipline may have declared it instead: "a red card
   * suspends for the season" is a rule of the sport as often as a rule of the
   * tournament. When both say something, this wins — it is what *this*
   * organizer configured. When neither does, no fact is produced rather than
   * one filed in a competition nobody named.
   */
  readonly scope?: CompetitionGranularity;
}

export function tagFactsFrom(input: TagEventInput): readonly TagFact[] {
  const declarations = new Map(input.declarations.map((one) => [one.code, one]));
  const definitions = new Map(input.definitions.map((one) => [one.code, one]));
  const facts: TagFact[] = [];

  for (const event of input.events) {
    for (const effect of definitions.get(event.definitionCode)?.effects ?? []) {
      if (effect.kind !== 'tag') continue;

      const declaration = declarations.get(effect.tagCode);
      // A discipline may name a tag its tournament did not declare; producing
      // the fact anyway would put a label on somebody that nothing defines.
      if (!declaration) continue;

      const actor = event.side === undefined ? undefined : input.actorOf(event.side);
      const personId = event.personId ?? actor?.personId;
      if (personId === undefined && actor === undefined) continue;

      const granularity = declaration.appliesTo[0];
      if (granularity === undefined) continue;

      const scope = tagScopeFor(declaration, input.scope);
      if (scope === undefined) continue;

      const actorId = actorIdAt({ ...actor, personId: personId ?? '' }, granularity);
      if (actorId === undefined || actorId === '') continue;

      facts.push({
        code: effect.tagCode,
        action: effect.action,
        actorGranularity: granularity,
        actorId,
        competitionGranularity: scope,
        competitionId: competitionIdAt(scope, input.context),
        // The discipline decided this, through an event somebody recorded — so
        // the trail names both rather than an anonymous "system".
        actor: `event:${event.eventId}`,
        reason: `${definitions.get(event.definitionCode)?.label ?? event.definitionCode}`,
        at: event.occurredAt,
      });
    }
  }

  return facts;
}

function actorIdAt(
  actor: Partial<ActorContext> & { personId: string },
  granularity: ActorGranularity,
): string | undefined {
  switch (granularity) {
    case 'person':
      return actor.personId;
    case 'player':
      return actor.playerId;
    case 'team':
      return actor.teamId;
    case 'club':
      return actor.clubId;
  }
}

function competitionIdAt(granularity: CompetitionGranularity, context: CompetitionContext): string {
  switch (granularity) {
    case 'event':
    case 'segment':
    case 'match':
      return context.matchId;
    case 'stage':
      return context.stageId;
    case 'season':
      return context.seasonId;
    case 'tournament':
      return context.tournamentId;
    case 'organization':
      return context.organizationId;
  }
}
