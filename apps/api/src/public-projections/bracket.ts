import { NotFoundException } from '../http/error-contract.js';
import {
  CompetitionRepository,
  Database,
  EnrollmentRepository,
  stageMatchOrdinals,
  StageReadModel,
  withTransaction,
} from '@copalibre/persistence';
import { PublicBracketResponse } from '../dto/public-tournament.dto.js';
import { Kysely } from 'kysely';
import { ambiguousRoundPositions, toBracketMatch } from '../controllers/seeding.controller.js';
import {
  orderZonesByPromotionBands,
  overallPlaceOffsetsForZones,
  resolveStageZones,
} from '../controllers/bracket-zones.js';
import { stageQualifierPlans } from '../controllers/stage-qualifiers.js';
import {
  bracketLinks,
  graphRecordsOf,
  placementMatchOf,
} from '../controllers/bracket-placements.js';
import { persistedBracketMatches } from '../controllers/persisted-bracket.js';
import { qualifierLabelsForRecords } from '../controllers/fixture-sources.js';
import { readStageSeriesByPosition, seriesResponseOf } from '../controllers/stage-series.js';
import { entrantVisibilityById } from '../public-person-visibility.js';
import { generateFixtures } from '@copalibre/tournament-engine';
import { effectiveFormat } from '@copalibre/domain';
import { resolvePublishedTournament } from './context.js';

export async function bracket(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  stageNumberStr: string,
): Promise<PublicBracketResponse> {
  const { tournament } = await resolvePublishedTournament(db, organizationAlias, tournamentAlias);
  const stageNumber = parseInt(stageNumberStr, 10);

  const compRepo = new CompetitionRepository(db);
  const season = await withTransaction(db, (uow) =>
    compRepo.currentSeason(uow, {
      tournamentId: tournament.tournamentId,
      organizationId: tournament.organizationId,
      actor: 'system',
      authorizationContext: '',
    }),
  );
  const stages = await compRepo.listStages(season.seasonId);
  const stage = stages.find((s) => s.number === stageNumber);
  if (!stage) throw new NotFoundException({ errorCode: 'public-projection-not-found' });

  const readModel = new StageReadModel(db);
  const enrollmentRepo = new EnrollmentRepository(db);
  const [declaredZones, promotionPlans] = await Promise.all([
    resolveStageZones(db, stage.stageId),
    stageQualifierPlans(db, stage.stageId),
  ]);
  const zones = orderZonesByPromotionBands(
    declaredZones,
    promotionPlans.map(({ plan }) => plan),
  );
  const overallOffsets = overallPlaceOffsetsForZones(
    zones,
    promotionPlans.map(({ plan }) => plan),
  );

  // Computed once, from every zone combined — a per-zone fetch below cannot
  // reconstruct this on its own, since it has no visibility into how many
  // matches other zones contribute ahead of it.
  const ordinalByMatchId = stageMatchOrdinals(await readModel.matches(stage.stageId));

  const zoneResponses = await Promise.all(
    zones.map(async (zone) => {
      const overallPlaceOffset =
        zone.zoneName === undefined ? undefined : overallOffsets.get(zone.zoneName);
      const zoneRecords = await readModel.matches(stage.stageId, undefined, zone.zoneId);
      if (zoneRecords.length > 0 && zoneRecords.every((record) => record.node !== undefined)) {
        const series = await readStageSeriesByPosition(db, {
          tournamentId: tournament.tournamentId,
          stageId: stage.stageId,
          zoneId: zone.zoneId,
          records: zoneRecords,
        });
        const details = await enrollmentRepo.resolveEntrantPodiumDetails(
          zoneRecords.flatMap((record) =>
            [record.homeEntrantId, record.awayEntrantId].filter(
              (id): id is string => id !== undefined,
            ),
          ),
        );
        const visibilityByEntrant = await entrantVisibilityById(
          db,
          tournament,
          zoneRecords.flatMap((record) =>
            [record.homeEntrantId, record.awayEntrantId].filter(
              (id): id is string => id !== undefined,
            ),
          ),
        );
        return {
          ...zone,
          format: effectiveFormat(zone, stage),
          ...(overallPlaceOffset === undefined ? {} : { overallPlaceOffset }),
          matches: persistedBracketMatches(
            zoneRecords,
            (record) => {
              const state = series.get(record.fixtureId);
              return state === undefined ? undefined : seriesResponseOf(state);
            },
            undefined,
            await qualifierLabelsForRecords(db, zoneRecords),
          ).map(({ persistedMatchId, ...match }) => ({
            ...match,
            matchNumber: ordinalByMatchId.get(persistedMatchId ?? ''),
            slots: match.slots.map((slot) => {
              const identity =
                slot.entrantId === undefined ? undefined : details.get(slot.entrantId);
              const visibility =
                slot.entrantId === undefined ? undefined : visibilityByEntrant.get(slot.entrantId);
              return {
                ...slot,
                ...(identity === undefined
                  ? {}
                  : {
                      ...(visibility?.hiddenAtRequest
                        ? { name: undefined, hiddenAtRequest: true }
                        : { name: identity.name }),
                      ...(visibility === undefined
                        ? {}
                        : { publicProfileAvailable: visibility.publicProfileAvailable }),
                      ...(visibility?.publicProfileAvailable === false
                        ? {}
                        : {
                            abbreviation: identity.abbreviation,
                            clubId: identity.clubId,
                            emblemObjectId: identity.emblemObjectId,
                          }),
                    }),
              };
            }),
          })),
        };
      }
      // Placement games sit beside the generated graph, not on it.
      const stageMatchesMapped = graphRecordsOf(zoneRecords);
      const record = await readModel.stageRecord(stage.stageId, undefined, zone.zoneId);

      // Seeded from this zone's own entrants, the same way the control panel's bracket is: the
      // graph's shape is a function of format plus seed order, and generating from an empty
      // entrant list produces no graph at all — which is what this endpoint used to return for
      // every stage, an empty bracket the public web then rendered as an empty page. Scoping the
      // entrant list (and every match lookup below) to this one zone is what stops a multi-zone
      // stage's zones from colliding on the same round/position.
      const format = effectiveFormat(zone, stage);
      const generated = generateFixtures({
        format: format as Parameters<typeof generateFixtures>[0]['format'],
        entrants: (record?.entrantIds ?? []).map((entrantId, index) => ({
          entrantId,
          seed: index + 1,
        })),
      });
      if (!generated.ok) {
        return {
          ...zone,
          format,
          ...(overallPlaceOffset === undefined ? {} : { overallPlaceOffset }),
          matches: [],
        };
      }
      const graph = generated.value;

      const ambiguous = ambiguousRoundPositions(graph.matches);

      const bracketMatches = graph.matches.map((match) =>
        toBracketMatch(match, stageMatchesMapped, {
          ambiguousPositions: ambiguous,
          matchFormat: undefined,
        }),
      );

      const { placements, sourcesOf } = bracketLinks(
        bracketMatches,
        zoneRecords,
        stageMatchesMapped,
      );

      const entrantIds = new Set<string>();
      for (const match of bracketMatches) {
        for (const slot of match.slots) {
          if (slot.entrantId) entrantIds.add(slot.entrantId);
        }
      }
      for (const node of placements) {
        for (const id of [node.record.homeEntrantId, node.record.awayEntrantId]) {
          if (id) entrantIds.add(id);
        }
      }
      const details = await enrollmentRepo.resolveEntrantPodiumDetails(Array.from(entrantIds));
      const visibilityByEntrant = await entrantVisibilityById(db, tournament, [...entrantIds]);

      // Keyed by the round/position the bracket graph and the read model agree on, so a series
      // rides onto the cross it settles rather than onto a match id neither side shares — scoped
      // to this zone's own records, so a series can't ride onto another zone's identically
      // round/position-keyed cross.
      const seriesByPosition = await readStageSeriesByPosition(db, {
        tournamentId: tournament.tournamentId,
        stageId: stage.stageId,
        zoneId: zone.zoneId,
        records: stageMatchesMapped,
      });

      return {
        ...zone,
        format,
        ...(overallPlaceOffset === undefined ? {} : { overallPlaceOffset }),
        matches: [
          ...bracketMatches.map((m) => {
            const series = seriesByPosition.get(`${m.round}:${m.position}`);
            return {
              matchId: m.matchId,
              bracket: m.bracket,
              round: m.round,
              position: m.position,
              status: m.status,
              ...(m.winnerEntrantId === undefined ? {} : { winnerEntrantId: m.winnerEntrantId }),
              format: m.format,
              ...(m.persistedMatchId === undefined
                ? {}
                : { matchNumber: ordinalByMatchId.get(m.persistedMatchId) }),
              slots: m.slots.map((s, slotIndex) => {
                const detail = s.entrantId ? details.get(s.entrantId) : undefined;
                const visibility = s.entrantId ? visibilityByEntrant.get(s.entrantId) : undefined;
                const from = s.kind === 'entrant' ? sourcesOf(m)[slotIndex] : undefined;
                return {
                  kind: s.kind,
                  entrantId: s.entrantId,
                  ...(s.entrantId && !visibility?.hiddenAtRequest
                    ? { name: detail?.name ?? 'Unknown' }
                    : {}),
                  ...(visibility?.hiddenAtRequest ? { hiddenAtRequest: true } : {}),
                  ...(visibility === undefined
                    ? {}
                    : { publicProfileAvailable: visibility.publicProfileAvailable }),
                  ...(visibility?.publicProfileAvailable === false
                    ? {}
                    : {
                        abbreviation: detail?.abbreviation,
                        clubId: detail?.clubId,
                        emblemObjectId: detail?.emblemObjectId,
                      }),
                  matchId: s.matchId,
                  ...(from === undefined ? {} : { from }),
                  score: s.score,
                  resultReason: s.resultReason,
                };
              }),
              ...(series === undefined ? {} : { series: seriesResponseOf(series) }),
            };
          }),
          ...placements.map((node) => ({
            ...placementMatchOf(node),
            matchNumber: ordinalByMatchId.get(node.record.matchId),
            slots: [node.record.homeEntrantId, node.record.awayEntrantId].map(
              (entrantId, index) => {
                const detail = entrantId ? details.get(entrantId) : undefined;
                const source = node.sources[index];
                return {
                  kind: 'entrant' as const,
                  entrantId,
                  ...(entrantId && !visibilityByEntrant.get(entrantId)?.hiddenAtRequest
                    ? { name: detail?.name ?? 'Unknown' }
                    : {}),
                  ...(visibilityByEntrant.get(entrantId ?? '')?.hiddenAtRequest
                    ? { hiddenAtRequest: true }
                    : {}),
                  ...(entrantId && visibilityByEntrant.has(entrantId)
                    ? {
                        publicProfileAvailable:
                          visibilityByEntrant.get(entrantId)?.publicProfileAvailable,
                      }
                    : {}),
                  ...(visibilityByEntrant.get(entrantId ?? '')?.publicProfileAvailable === false
                    ? {}
                    : {
                        abbreviation: detail?.abbreviation,
                        clubId: detail?.clubId,
                        emblemObjectId: detail?.emblemObjectId,
                      }),
                  ...(source === undefined ? {} : { from: source }),
                  score: node.record.scores?.[index],
                  resultReason: node.record.resultReasons?.[index],
                };
              },
            ),
          })),
        ],
      };
    }),
  );

  return { format: stage.format, zones: zoneResponses };
}
