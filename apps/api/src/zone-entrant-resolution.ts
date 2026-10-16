import type { Kysely } from 'kysely';
import {
  ZoneEntrantResolution,
  type Database,
  type ZoneEntrantResolver,
  type ZoneSeriesLookup,
} from '@copalibre/persistence';
import { resolvePersistedNodes } from '@copalibre/tournament-engine';
import { readStageSeries } from './controllers/stage-series.js';

/**
 * The engine's persisted-graph resolution, bound to persistence's structural port. The annotation
 * is the drift check: if either side's shape changes, this assignment stops typechecking.
 */
const resolveZone: ZoneEntrantResolver = resolvePersistedNodes;

/** The zone's series declaration, by the same zone → stage → ruleset precedence as every reader. */
const zoneSeriesOf =
  (db: Kysely<Database>): ZoneSeriesLookup =>
  (zone) =>
    readStageSeries(db, zone);

/**
 * The single place production code builds the persisted-entrant writer. Every result path that
 * resolves a zone takes its `ZoneEntrantResolution` from here, so none can choose a resolver.
 */
export function zoneEntrantResolution(db: Kysely<Database>): ZoneEntrantResolution {
  return new ZoneEntrantResolution(db, resolveZone, zoneSeriesOf(db));
}
