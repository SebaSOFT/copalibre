import type { FastifyReply } from 'fastify';
import { NotFoundException } from '../http/error-contract.js';
import { Database, PersonRepository } from '@copalibre/persistence';
import {
  PlayerStatisticsDrilldownResponse,
  PublicPersonProfileResponse,
} from '../dto/public-tournament.dto.js';
import { Kysely } from 'kysely';
import {
  latestFinalizedShirtNumbers,
  listEffectiveTableLayouts,
  type PlayerStatisticsDrilldownResult,
  readPlayerStatisticsDrilldown,
} from '../table-projections/read.js';
import {
  ageAt,
  type DisciplineDescriptor,
  readableAt,
  resolveLabel,
  type StatisticCollector,
  type Tournament,
} from '@copalibre/domain';
import { resolvePublishedTournament } from './context.js';

export async function playerProfile(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  personId: string,
  reply: FastifyReply,
): Promise<PublicPersonProfileResponse> {
  const { tournament } = await resolvePublishedTournament(db, organizationAlias, tournamentAlias);
  const people = new PersonRepository(db);
  const person = await people.findPerson(personId);
  if (
    !person ||
    person.organizationId !== tournament.organizationId ||
    !canShowPublicPlayerProfile(tournament, person.hiddenFromPublic)
  ) {
    throw new NotFoundException(
      `No person "${personId}" found in organization "${organizationAlias}"`,
      { errorCode: 'public-projection-not-found' },
    );
  }

  const [history, careerDisciplineTotals, descriptorRows] = await Promise.all([
    people.competitionHistory(tournament.organizationId, personId),
    people.careerTotals(tournament.organizationId, personId),
    db
      .selectFrom('discipline_descriptors')
      .select(['descriptor_id as descriptorId', 'version', 'document'])
      .execute(),
  ]);

  const descriptorMap = new Map<string, DisciplineDescriptor>();
  const descriptorVersionMap = new Map<string, DisciplineDescriptor>();
  for (const d of descriptorRows) {
    const parsed = (
      typeof d.document === 'string' ? JSON.parse(d.document) : d.document
    ) as DisciplineDescriptor;
    descriptorMap.set(d.descriptorId, parsed);
    descriptorVersionMap.set(`${d.descriptorId}@${d.version}`, parsed);
  }

  const uniqueTournamentIds = [...new Set(history.map((item) => item.tournamentId))];
  const shirtNumbersByTournament = new Map(
    await Promise.all(
      uniqueTournamentIds.map(async (tid) => {
        const numbers = await latestFinalizedShirtNumbers(db, {
          organizationId: tournament.organizationId,
          tournamentId: tid,
          personIds: [personId],
        });
        return [tid, numbers.get(personId)] as const;
      }),
    ),
  );

  const careerStatistics = buildCareerStatistics({
    careerDisciplineTotals,
    history,
    descriptorMap,
    descriptorVersionMap,
  });

  const competitionHistory = history.map((item) => {
    const desc =
      descriptorVersionMap.get(
        `${item.disciplineRef.descriptorId}@${item.disciplineRef.version}`,
      ) ?? descriptorMap.get(item.disciplineRef.descriptorId);
    const localizedDisciplineName =
      desc?.name !== undefined && typeof desc.name !== 'string' ? desc.name : undefined;
    const shirtNumber = shirtNumbersByTournament.get(item.tournamentId);
    return {
      tournamentId: item.tournamentId,
      tournamentName: item.tournamentName,
      tournamentAlias: item.tournamentAlias,
      teamId: item.teamId,
      teamName: item.teamName,
      ...(item.clubAlias === undefined ? {} : { clubAlias: item.clubAlias }),
      ...(shirtNumber === undefined ? {} : { shirtNumber }),
      role: item.role,
      entrantId: item.entrantId,
      entrantName: item.entrantName,
      entrantAbbreviation: item.entrantAbbreviation,
      disciplineDescriptorId: item.disciplineRef.descriptorId,
      disciplineDescriptorVersion: item.disciplineRef.version,
      disciplineName: desc?.name ? resolveLabel(desc.name, 'en') : undefined,
      ...(localizedDisciplineName === undefined ? {} : { localizedDisciplineName }),
    };
  });

  // Set here, not with @Header: Nest applies that before the handler, so a 404 would carry it.
  reply.header('Cache-Control', 'public, max-age=60');
  return {
    personId: person.personId,
    displayName: person.displayName,
    alias: person.alias,
    nationality: person.nationality,
    photoObjectId: person.photoObjectId,
    age: person.birthDate ? ageAt(person.birthDate) : undefined,
    competitionHistory,
    careerStatistics,
  };
}

export async function playerStatistics(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  personId: string,
  layoutParam?: string,
): Promise<PlayerStatisticsDrilldownResponse> {
  const { tournament } = await resolvePublishedTournament(db, organizationAlias, tournamentAlias);

  const person = await new PersonRepository(db).findPerson(personId);
  if (
    !person ||
    person.organizationId !== tournament.organizationId ||
    !canShowPublicPlayerProfile(tournament, person.hiddenFromPublic)
  ) {
    throw new NotFoundException(
      `No person "${personId}" found in organization "${organizationAlias}"`,
      { errorCode: 'public-projection-not-found' },
    );
  }

  let layoutCode = layoutParam;
  if (layoutCode === undefined) {
    const layouts = await listEffectiveTableLayouts(db, {
      tournamentId: tournament.tournamentId,
      disciplineRef: tournament.disciplineRef,
    });
    const defaultLayout = layouts.find(
      (one) => one.entityGranularity === 'person' || one.entityGranularity === 'player',
    );
    if (!defaultLayout) {
      throw new NotFoundException(
        `No person-granularity table layout for tournament "${tournamentAlias}"`,
        { errorCode: 'public-projection-not-found' },
      );
    }
    layoutCode = defaultLayout.code;
  }

  const result = await readPlayerStatisticsDrilldown(
    db,
    {
      organizationId: tournament.organizationId,
      tournament: {
        tournamentId: tournament.tournamentId,
        disciplineRef: tournament.disciplineRef,
        includesMinors: tournament.includesMinors,
        showYouthProfiles: tournament.showYouthProfiles,
      },
    },
    personId,
    layoutCode,
  );
  return playerStatisticsResponse(result);
}

function canShowPublicPlayerProfile(tournament: Tournament, hiddenFromPublic?: boolean): boolean {
  return (
    hiddenFromPublic !== true &&
    !(tournament.includesMinors === true && tournament.showYouthProfiles !== true)
  );
}

function buildCareerStatistics(input: {
  readonly careerDisciplineTotals: Awaited<ReturnType<PersonRepository['careerTotals']>>;
  readonly history: Awaited<ReturnType<PersonRepository['competitionHistory']>>;
  readonly descriptorMap: ReadonlyMap<string, DisciplineDescriptor>;
  readonly descriptorVersionMap: ReadonlyMap<string, DisciplineDescriptor>;
}): PublicPersonProfileResponse['careerStatistics'] {
  const totalsByDescriptor = new Map(
    input.careerDisciplineTotals
      .filter((disc) => disc.descriptorId !== 'default')
      .map((disc) => [disc.descriptorId, disc]),
  );
  const versionByDescriptor = new Map<string, string>();
  const orderedDescriptorIds: string[] = [];
  const addDescriptorId = (descriptorId: string, version?: string) => {
    if (version !== undefined && !versionByDescriptor.has(descriptorId)) {
      versionByDescriptor.set(descriptorId, version);
    }
    if (!orderedDescriptorIds.includes(descriptorId)) orderedDescriptorIds.push(descriptorId);
  };
  for (const disc of input.careerDisciplineTotals) {
    if (disc.descriptorId !== 'default') addDescriptorId(disc.descriptorId);
  }
  for (const item of input.history) {
    addDescriptorId(item.disciplineRef.descriptorId, item.disciplineRef.version);
  }

  const result: PublicPersonProfileResponse['careerStatistics'] = [];
  for (const descriptorId of orderedDescriptorIds) {
    const version = versionByDescriptor.get(descriptorId);
    const desc =
      (version !== undefined
        ? input.descriptorVersionMap.get(`${descriptorId}@${version}`)
        : undefined) ?? input.descriptorMap.get(descriptorId);
    const existing = totalsByDescriptor.get(descriptorId);
    const statistics = mergeCareerDisciplineCollectors(desc, existing?.totals ?? []);
    if (statistics.length === 0) continue;

    const localizedDisciplineName =
      desc?.name !== undefined && typeof desc.name !== 'string' ? desc.name : undefined;
    result.push({
      disciplineDescriptorId: descriptorId,
      disciplineName:
        existing?.disciplineName ?? (desc?.name ? resolveLabel(desc.name, 'en') : undefined),
      ...(localizedDisciplineName === undefined ? {} : { localizedDisciplineName }),
      statistics,
    });
  }

  const unclaimed = input.careerDisciplineTotals.find((disc) => disc.descriptorId === 'default');
  if (unclaimed && unclaimed.totals.length > 0) {
    result.push({
      disciplineDescriptorId: unclaimed.descriptorId,
      disciplineName: unclaimed.disciplineName,
      statistics: unclaimed.totals.map((tot) => ({
        code: tot.collectorCode,
        label: tot.collectorCode,
        value: tot.value,
        samples: tot.samples,
      })),
    });
  }
  return result;
}

function mergeCareerDisciplineCollectors(
  desc: DisciplineDescriptor | undefined,
  recordedTotals: readonly {
    readonly collectorCode: string;
    readonly value: number;
    readonly samples: number;
  }[],
): PublicPersonProfileResponse['careerStatistics'][number]['statistics'] {
  const recordedByCode = new Map(recordedTotals.map((tot) => [tot.collectorCode, tot]));
  const collectorMap = new Map<string, StatisticCollector>();
  const emitted = new Set<string>();
  const statistics: PublicPersonProfileResponse['careerStatistics'][number]['statistics'] = [];

  for (const collector of desc?.collectors ?? []) {
    collectorMap.set(collector.code, collector);
    if (!readableAt(collector, { actor: 'person', competition: 'organization' })) continue;
    const recorded = recordedByCode.get(collector.code);
    statistics.push(careerStatisticItem(collector.code, collector, recorded));
    emitted.add(collector.code);
  }

  for (const tot of recordedTotals) {
    if (emitted.has(tot.collectorCode)) continue;
    statistics.push(
      careerStatisticItem(tot.collectorCode, collectorMap.get(tot.collectorCode), tot),
    );
  }
  return statistics;
}

function careerStatisticItem(
  code: string,
  colDef: StatisticCollector | undefined,
  recorded: { readonly value: number; readonly samples: number } | undefined,
): PublicPersonProfileResponse['careerStatistics'][number]['statistics'][number] {
  const localizedLabel =
    colDef?.label !== undefined && typeof colDef.label !== 'string' ? colDef.label : undefined;
  const label = colDef?.label ? resolveLabel(colDef.label, 'en') : code;
  return {
    code,
    label,
    ...(localizedLabel === undefined ? {} : { localizedLabel }),
    value: recorded?.value ?? 0,
    samples: recorded?.samples ?? 0,
  };
}

function playerStatisticsResponse(
  result: PlayerStatisticsDrilldownResult,
): PlayerStatisticsDrilldownResponse {
  const columns = result.layout.columns
    .filter((column) => column.source.kind !== 'rank')
    .map((column) => ({
      code: column.code,
      header: column.header,
      ...(column.shortHeader === undefined ? {} : { shortHeader: column.shortHeader }),
      ...(column.zeroDisplay === undefined ? {} : { zeroDisplay: column.zeroDisplay }),
      format: column.format,
    }));

  return {
    layoutCode: result.layout.code,
    label: result.layout.label,
    columns,
    ...(result.tournamentTotal === undefined ? {} : { tournamentTotal: result.tournamentTotal }),
    matches: result.matches.map((row) => ({
      stageNumber: row.match.stageNumber,
      matchNumber: row.match.matchNumber,
      ...(row.scheduledAt === undefined ? {} : { scheduledAt: row.scheduledAt }),
      side: row.side,
      opponentName: row.opponentName,
      ...(row.opponentAbbreviation === undefined
        ? {}
        : { opponentAbbreviation: row.opponentAbbreviation }),
      ...(row.opponentClubAlias === undefined ? {} : { opponentClubAlias: row.opponentClubAlias }),
      ...(row.ownScore === undefined ? {} : { ownScore: row.ownScore }),
      ...(row.opponentScore === undefined ? {} : { opponentScore: row.opponentScore }),
      cells: row.cells,
    })),
  };
}
