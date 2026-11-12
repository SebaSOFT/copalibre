/* global setInterval, clearInterval */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const datasetDirectory = new URL(
  '../../packages/demo-datasets/datasets/panamericano-clubes-2025/',
  import.meta.url,
);
const dataset = JSON.parse(await readFile(new URL('dataset.json', datasetDirectory), 'utf8'));

const clubs = dataset.clubs.map((club, index) => ({
  ...club,
  clubId: uuid(index + 1),
}));
const clubsByAlias = new Map(clubs.map((club) => [club.alias, club]));
const clubsById = new Map(clubs.map((club) => [club.clubId, club]));
const teamsByAlias = new Map(dataset.teams.map((team) => [team.alias, team]));
const phasesByAlias = new Map(
  dataset.phases.map((phase, index) => [phase.alias, { ...phase, stageNumber: index + 1 }]),
);
const gamesByStage = new Map();

for (const game of dataset.games) {
  const phase = phasesByAlias.get(game.phaseAlias);
  if (!phase) continue;
  const games = gamesByStage.get(phase.stageNumber) ?? [];
  games.push(game);
  gamesByStage.set(phase.stageNumber, games);
}

const gameRecords = [...gamesByStage.entries()].flatMap(([stageNumber, games]) =>
  games.map((game, index) => ({
    game,
    phase: phasesByAlias.get(game.phaseAlias),
    stageNumber,
    stageOrdinal: index + 1,
  })),
);

function uuid(number) {
  return `019cf000-0000-7000-8000-${number.toString().padStart(12, '0')}`;
}

function clubForTeam(teamAlias) {
  const team = teamsByAlias.get(teamAlias);
  return clubsByAlias.get(team?.clubAlias ?? teamAlias);
}

function isoDate(value) {
  return new Date(`${value}:00-03:00`).toISOString();
}

function matchView(record) {
  const { game, phase, stageNumber, stageOrdinal } = record;
  const home = clubForTeam(game.homeTeamAlias);
  const away = clubForTeam(game.awayTeamAlias);

  return {
    matchId: uuid(stageNumber * 1000 + stageOrdinal),
    stageNumber,
    matchNumber: stageOrdinal,
    round: game.roundNumber,
    status: 'final',
    homeName: home?.name ?? game.homeTeamAlias,
    homeAbbreviation: home?.abbreviation,
    homeClubId: home?.clubId,
    homeEmblemObjectId: home ? uuid(1000 + clubs.indexOf(home)) : undefined,
    homeScore: game.homeGoals,
    awayName: away?.name ?? game.awayTeamAlias,
    awayAbbreviation: away?.abbreviation,
    awayClubId: away?.clubId,
    awayEmblemObjectId: away ? uuid(1000 + clubs.indexOf(away)) : undefined,
    awayScore: game.awayGoals,
    venueName: dataset.venues.find((venue) => venue.alias === game.venueAlias)?.name,
    scheduledAt: isoDate(game.scheduledAt),
    groupName: phase?.kind === 'group' ? phase.name : undefined,
  };
}

const matches = gameRecords.map(matchView);
const stageSummaries = dataset.phases.map((phase, index) => {
  const stageMatches = gameRecords.filter((record) => record.phase.alias === phase.alias);
  return {
    stageNumber: index + 1,
    stageName: phase.name,
    totalMatches: stageMatches.length,
    resolvedMatches: stageMatches.length,
    liveMatches: 0,
    scheduledMatches: 0,
    finalizedMatches: stageMatches.length,
    forfeitedMatches: 0,
  };
});

const overview = {
  organizationAlias: dataset.organization.alias,
  organizationName: dataset.organization.name,
  organizationTimeZone: dataset.organization.timezone,
  tournamentAlias: dataset.tournament.alias,
  tournamentName: dataset.tournament.name,
  seasonName: dataset.tournament.season,
  status: 'finished',
  matches: gameRecords.map((record) => {
    const match = matchView(record);
    return { ...match, stageOrdinal: record.stageOrdinal };
  }),
  clubs: clubs.map((club) => ({
    clubId: club.clubId,
    name: club.name,
    alias: club.alias,
    abbreviation: club.abbreviation,
    emblemObjectId: uuid(1000 + clubs.indexOf(club)),
  })),
  ruleset: {},
};

const completion = {
  totalMatches: matches.length,
  resolvedMatches: matches.length,
  liveMatches: 0,
  scheduledMatches: 0,
  finalizedMatches: matches.length,
  forfeitedMatches: 0,
  stages: stageSummaries,
};

// The table layouts the demo's discipline module declares, so the overview renders
// its standings and top performers as on a real installation.
const disciplineModule = JSON.parse(
  await readFile(
    new URL('../../apps/seed/src/test-fixtures/rink-hockey-1.1.0.artifact.json', import.meta.url),
    'utf8',
  ),
);
const tableLayouts = new Map(disciplineModule.tableLayouts.map((layout) => [layout.code, layout]));
const { pointsPerWin, pointsPerDraw, pointsPerLoss } = disciplineModule.defaults.scoring;

function formatCell(value, column) {
  if (value === 0 && column.zeroDisplay !== undefined) return column.zeroDisplay;
  if (column.format === 'decimal-2') return value.toFixed(2);
  if (column.format === 'decimal-1') return value.toFixed(1);
  if (column.format === 'percentage') return `${Math.round(value * 100)}%`;
  return String(value);
}

/** Ranks rows by the layout's `defaultSort`; tied rows share a rank. */
function rankRows(layout, entries) {
  const sortKey = (entry) => layout.defaultSort.map((rule) => entry.values[rule.columnCode] ?? 0);
  const compare = (left, right) => {
    const leftKey = sortKey(left);
    const rightKey = sortKey(right);
    for (const [index, rule] of layout.defaultSort.entries()) {
      const difference = leftKey[index] - rightKey[index];
      if (difference !== 0) return rule.direction === 'desc' ? -difference : difference;
    }
    return 0;
  };
  const ordered = [...entries].sort(compare);
  return ordered.map((entry) => {
    const firstTied = ordered.findIndex((other) => compare(other, entry) === 0);
    const tied = ordered.filter((other) => compare(other, entry) === 0).length > 1;
    const cells = {};
    for (const column of layout.columns) {
      if (column.code === 'rank') {
        cells.rank = { value: firstTied + 1, formatted: String(firstTied + 1) };
      } else if (column.code in entry.text) {
        cells[column.code] = { formatted: entry.text[column.code] };
      } else if (column.code in entry.fractions) {
        const [numerator, denominator] = entry.fractions[column.code];
        cells[column.code] = { formatted: `${numerator}/${denominator}`, numerator, denominator };
      } else {
        const value = entry.values[column.code] ?? 0;
        cells[column.code] = { value, formatted: formatCell(value, column) };
      }
    }
    return { ...entry.row, rank: firstTied + 1, sharedRank: tied, cells };
  });
}

function projection(layout, rows, extra = {}) {
  return {
    layoutCode: layout.code,
    target: layout.target,
    label: layout.label,
    columns: layout.columns.map(
      ({ code, header, shortHeader, description, zeroDisplay, format }) => ({
        code,
        header,
        ...(shortHeader === undefined ? {} : { shortHeader }),
        ...(description === undefined ? {} : { description }),
        ...(zeroDisplay === undefined ? {} : { zeroDisplay }),
        format,
      }),
    ),
    defaultSort: layout.defaultSort,
    rows,
    projectionVersion: 1,
    ...extra,
  };
}

function clubRow(club) {
  return {
    actorId: club.clubId,
    entrantId: club.clubId,
    actorName: club.name,
    entrantName: club.name,
    entrantAbbreviation: club.abbreviation,
    clubId: club.clubId,
    emblemObjectId: uuid(1000 + clubs.indexOf(club)),
  };
}

function groupStandings(stageNumber) {
  const layout = tableLayouts.get('group-standings-default');
  const records = gameRecords.filter((record) => record.stageNumber === stageNumber);
  const phase = records[0]?.phase;
  if (!layout || phase?.kind !== 'group') return undefined;

  const totals = new Map();
  const totalsFor = (teamAlias) => {
    const club = clubForTeam(teamAlias);
    if (!totals.has(club.clubId)) {
      totals.set(club.clubId, { club, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0 });
    }
    return totals.get(club.clubId);
  };
  for (const { game } of records) {
    const home = totalsFor(game.homeTeamAlias);
    const away = totalsFor(game.awayTeamAlias);
    for (const [side, scored, conceded] of [
      [home, game.homeGoals, game.awayGoals],
      [away, game.awayGoals, game.homeGoals],
    ]) {
      side.played += 1;
      side.gf += scored;
      side.ga += conceded;
      if (scored > conceded) side.wins += 1;
      else if (scored === conceded) side.draws += 1;
      else side.losses += 1;
    }
  }

  const rows = rankRows(
    layout,
    [...totals.values()].map((total) => ({
      row: clubRow(total.club),
      text: { name: total.club.name },
      fractions: {},
      values: {
        played: total.played,
        wins: total.wins,
        draws: total.draws,
        losses: total.losses,
        gf: total.gf,
        ga: total.ga,
        gd: total.gf - total.ga,
        'goal-average': total.gf / Math.max(total.ga, 1),
        points:
          total.wins * pointsPerWin + total.draws * pointsPerDraw + total.losses * pointsPerLoss,
      },
    })),
  );
  return projection(layout, rows, {
    segments: [{ groupName: phase.name, rows }],
    grain: 'match',
  });
}

function playerStatistics() {
  const layout = tableLayouts.get('player-statistics');
  if (!layout) return undefined;

  const appearancesByTeam = new Map();
  for (const { game } of gameRecords) {
    for (const teamAlias of [game.homeTeamAlias, game.awayTeamAlias]) {
      appearancesByTeam.set(teamAlias, (appearancesByTeam.get(teamAlias) ?? 0) + 1);
    }
  }
  const goals = new Map();
  const penaltyGoals = new Map();
  const freeKickGoals = new Map();
  const add = (counts, alias) => counts.set(alias, (counts.get(alias) ?? 0) + 1);
  for (const { game } of gameRecords) {
    for (const event of game.events ?? []) {
      if (event.type !== 'goal' || !event.playerAlias) continue;
      add(goals, event.playerAlias);
      if (event.detail === 'penalti') add(penaltyGoals, event.playerAlias);
      if (event.detail === 'falta directa') add(freeKickGoals, event.playerAlias);
    }
  }

  const rows = rankRows(
    layout,
    dataset.players.map((player, index) => {
      const club = clubForTeam(player.teamAlias);
      const name = `${player.givenNames} ${player.surname}`;
      const g = goals.get(player.alias) ?? 0;
      const pj = appearancesByTeam.get(player.teamAlias) ?? 0;
      const as = player.assists ?? 0;
      const pen = penaltyGoals.get(player.alias) ?? 0;
      const fd = freeKickGoals.get(player.alias) ?? 0;
      return {
        row: {
          ...(club ? clubRow(club) : {}),
          actorId: uuid(5000 + index),
          actorName: name,
          nationality: player.nationality,
          publicProfileAvailable: true,
        },
        text: { player: name, team: club?.name ?? player.teamAlias },
        fractions: { fd: [fd, fd] },
        values: {
          g,
          pj,
          gpp: g / Math.max(pj, 1),
          as,
          app: as / Math.max(pj, 1),
          pen,
          'pen-percent': pen === 0 ? 0 : 1,
          'fd-percent': fd === 0 ? 0 : 1,
          az: 0,
          azpp: 0,
          rj: 0,
          rjpp: 0,
        },
      };
    }),
  );
  return projection(layout, rows);
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(value));
}

async function sendEmblem(response, objectPath) {
  try {
    const image = await readFile(new URL(objectPath, datasetDirectory));
    response.writeHead(200, {
      'content-type': 'image/png',
      'content-length': image.length,
      'cache-control': 'public, max-age=3600',
    });
    response.end(image);
  } catch {
    sendJson(response, 404, { statusCode: 404 });
  }
}

function matchReport(record) {
  const { game, phase, stageNumber, stageOrdinal } = record;
  const home = clubForTeam(game.homeTeamAlias);
  const away = clubForTeam(game.awayTeamAlias);

  return {
    organizationAlias: dataset.organization.alias,
    organizationName: dataset.organization.name,
    organizationTimeZone: dataset.organization.timezone,
    tournamentAlias: dataset.tournament.alias,
    tournamentName: dataset.tournament.name,
    stageNumber,
    stageFormat: phase?.kind === 'cup' ? 'single-elimination' : 'round-robin',
    matchNumber: stageOrdinal,
    round: game.roundNumber,
    status: 'final',
    homeEntrantId: home?.clubId,
    homeName: home?.name ?? game.homeTeamAlias,
    homeAbbreviation: home?.abbreviation,
    awayEntrantId: away?.clubId,
    awayName: away?.name ?? game.awayTeamAlias,
    awayAbbreviation: away?.abbreviation,
    homeScore: game.homeGoals,
    awayScore: game.awayGoals,
    scheduledAt: isoDate(game.scheduledAt),
    venueName: dataset.venues.find((venue) => venue.alias === game.venueAlias)?.name,
    schedulePublished: true,
    officials: [],
    rosters: { home: [], away: [] },
    timeline: [],
  };
}

/**
 * Routes this fixture leaves unanswered on purpose, each with its reason. Any
 * other path it answers with 404 means a measured page asked for something the
 * fixture does not model, and the page measured may not be the one visitors see.
 */
export const DECLARED_ABSENT_ROUTES = Object.freeze([
  {
    pattern: /^\/api\/organizations\/[^/]+\/tournaments\/[^/]+\/stages\/\d+\/bracket$/,
    reason: 'cup brackets are not yet modelled in this fixture',
  },
]);

/** The unanswered paths no declared-absent route explains. */
export function undeclaredMissingPaths(paths, declared = DECLARED_ABSENT_ROUTES) {
  return [...new Set(paths)].filter((path) => !declared.some(({ pattern }) => pattern.test(path)));
}

/** An open, empty event stream: a comment, then keep-alive comments until the client leaves. */
function sendEventStream(request, response) {
  response.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-store',
    connection: 'keep-alive',
  });
  response.write(': performance fixture stream\n\n');
  const keepAlive = setInterval(() => response.write(': keep-alive\n\n'), 15_000);
  request.once('close', () => clearInterval(keepAlive));
}

/**
 * @param {{ port?: number, host?: string }} [options] `port` 0 (the default)
 *   picks a free one; end-to-end specs pass their worker's mock API port. `host`
 *   is loopback unless a container must reach the fixture.
 */
export async function startPerformanceFixtureApi({ port = 0, host = '127.0.0.1' } = {}) {
  const missingPaths = [];
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname);
    const root = `/api/organizations/${dataset.organization.alias}`;
    const tournamentRoot = `${root}/tournaments/${dataset.tournament.alias}`;

    if (pathname === '/events' || pathname.startsWith('/events/')) {
      sendEventStream(request, response);
      return;
    }

    if (pathname === `${tournamentRoot}/overview`) {
      sendJson(response, 200, overview);
      return;
    }
    if (pathname === `${tournamentRoot}/completion`) {
      sendJson(response, 200, completion);
      return;
    }
    if (pathname === `${tournamentRoot}/matches-view`) {
      const stageParam = url.searchParams.get('stageNumber');
      const stageNumber = stageParam === null ? undefined : Number(stageParam);
      const state = url.searchParams.get('state');
      const filtered = matches.filter(
        (match) =>
          (stageNumber === undefined || match.stageNumber === stageNumber) &&
          (state === null || state === 'all' || state === 'final'),
      );
      sendJson(response, 200, { matches: filtered });
      return;
    }

    if (pathname === `${tournamentRoot}/public/tables`) {
      sendJson(response, 200, {
        layouts: [...tableLayouts.values()].map(({ code, target, label, entityGranularity }) => ({
          code,
          target,
          label,
          entityGranularity,
        })),
      });
      return;
    }
    if (pathname === `${tournamentRoot}/public/tables/player-statistics`) {
      sendJson(response, 200, playerStatistics());
      return;
    }
    const standingsPath = pathname.match(
      /^\/api\/organizations\/[^/]+\/tournaments\/[^/]+\/stages\/(\d+)\/public\/tables\/group-standings-default$/,
    );
    if (standingsPath) {
      const standings = groupStandings(Number(standingsPath[1]));
      if (standings) {
        sendJson(response, 200, standings);
        return;
      }
    }

    const matchPath = pathname.match(
      /^\/api\/organizations\/[^/]+\/tournaments\/[^/]+\/stages\/(\d+)\/matches\/(\d+)$/,
    );
    if (matchPath) {
      const record = gameRecords.find(
        (candidate) =>
          candidate.stageNumber === Number(matchPath[1]) &&
          candidate.stageOrdinal === Number(matchPath[2]),
      );
      if (record) {
        sendJson(response, 200, matchReport(record));
        return;
      }
    }

    const clubEmblemPath = pathname.match(/^\/api\/organizations\/[^/]+\/clubs\/([^/]+)\/emblem$/);
    if (clubEmblemPath) {
      const club = clubsById.get(clubEmblemPath[1]);
      if (club) {
        await sendEmblem(response, club.emblem);
        return;
      }
    }

    if (pathname === `${tournamentRoot}/emblem`) {
      await sendEmblem(response, dataset.tournament.emblem);
      return;
    }

    missingPaths.push(pathname);
    sendJson(response, 404, { statusCode: 404, message: 'Not found' });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Fixture API did not bind a TCP port');

  return {
    url: `http://127.0.0.1:${address.port}`,
    /** Every path answered with 404 so far, in request order, repeats included. */
    missingPaths: () => [...missingPaths],
    close: () =>
      new Promise((resolve, reject) => {
        // Open event streams never end on their own.
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fixture = await startPerformanceFixtureApi();
  process.stdout.write(`${fixture.url}\n`);
  process.on('SIGINT', () => void fixture.close().finally(() => process.exit(0)));
  process.on('SIGTERM', () => void fixture.close().finally(() => process.exit(0)));
}
