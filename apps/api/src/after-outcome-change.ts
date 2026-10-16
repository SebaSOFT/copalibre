import type { Kysely } from 'kysely';
import type {
  AuditContext,
  Database,
  UnitOfWork,
  ZoneEntrantResolutionOutcome,
} from '@copalibre/persistence';
import { zoneEntrantResolution } from './zone-entrant-resolution.js';
import type { CorrectionPlan } from '@copalibre/domain';

/** Resolves advancement in the transaction that recorded the outcome. Legacy zones are untouched. */
export async function afterOutcomeChange(
  db: Kysely<Database>,
  uow: UnitOfWork,
  matchId: string,
  audit: AuditContext,
  options: {
    readonly dryRun?: boolean;
    readonly replacement?: { readonly matchId: string; readonly result: unknown };
  } = {},
) {
  const fixture = await uow.tx
    .selectFrom('matches')
    .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
    .select('fixtures.zone_id')
    .where('matches.match_id', '=', matchId)
    .executeTakeFirstOrThrow();
  if (fixture.zone_id === null) return undefined;
  return zoneEntrantResolution(db).run(uow, fixture.zone_id, audit, options);
}

export function matchSideChanges(changes: ZoneEntrantResolutionOutcome['reResolved']) {
  return (changes ?? []).flatMap((change) =>
    change.matchIds.map((matchId) => ({
      matchId,
      side: change.side,
      currentEntrantId: change.currentEntrantId,
      resultingEntrantId: change.resultingEntrantId,
    })),
  );
}

export function blockedPropagationOf(
  prior: CorrectionPlan['blockedPropagation'],
  propagation: ZoneEntrantResolutionOutcome | undefined,
  stageId: string,
) {
  const matches = matchSideChanges(propagation?.blockedPropagation);
  if (matches.length === 0) return prior;
  return {
    stageId: prior?.stageId ?? stageId,
    reason:
      prior?.reason ??
      'A downstream fixture has already started; its shared participants remain unchanged pending authorized resolution',
    matches,
  };
}
