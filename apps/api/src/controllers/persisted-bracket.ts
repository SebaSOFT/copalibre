import type { StageMatchRecord } from '@copalibre/persistence';
import type { BracketMatchResponse } from '../dto/standings.dto.js';
import type { PublicSeriesStateResponse } from '../dto/public-tournament.dto.js';
import type { QualifierLabelDto } from '../dto/fixture-side-source.dto.js';
import { fixtureSourcesOf } from './fixture-sources.js';

/** A persisted zone's bracket comes from its records, including classification branches. */
export function persistedBracketMatches(
  records: readonly StageMatchRecord[],
  seriesOf: (record: StageMatchRecord) => PublicSeriesStateResponse | undefined,
  matchFormat?: string,
  qualifierLabels?: ReadonlyMap<string, readonly QualifierLabelDto[]>,
): BracketMatchResponse[] {
  return records.map((record) => {
    const node = record.node;
    if (!node) throw new Error('Expected a persisted graph node');
    const sources = fixtureSourcesOf(record, records, qualifierLabels);
    const series = seriesOf(record);
    return {
      ...sources,
      matchId: node.nodeKey,
      persistedMatchId: record.matchId,
      bracket: node.bracket,
      round: record.round,
      position: record.position,
      status: record.status,
      ...(node.branch === undefined ? {} : { role: node.branch }),
      ...(matchFormat === undefined ? {} : { format: matchFormat }),
      slots: [record.homeEntrantId, record.awayEntrantId].map((entrantId, index) => {
        const source = index === 0 ? sources.homeSource : sources.awaySource;
        const edge =
          source?.kind === 'winner-of' || source?.kind === 'loser-of' ? source : undefined;
        return {
          kind: entrantId === undefined ? (source?.kind ?? 'bye') : 'entrant',
          ...(entrantId === undefined ? {} : { entrantId }),
          ...(source === undefined ? {} : { source }),
          ...(edge === undefined
            ? {}
            : {
                matchId: edge.nodeKey,
                from: {
                  matchId: edge.nodeKey,
                  outcome: edge.kind === 'winner-of' ? ('winner' as const) : ('loser' as const),
                },
              }),
          ...(record.scores?.[index] === undefined ? {} : { score: record.scores[index] }),
          ...(record.resultReasons?.[index] === undefined
            ? {}
            : { resultReason: record.resultReasons[index] }),
        };
      }),
      ...(series === undefined ? {} : { series }),
    };
  });
}
