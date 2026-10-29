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

export async function startPerformanceFixtureApi() {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname);
    const root = `/organizations/${dataset.organization.alias}`;
    const tournamentRoot = `${root}/tournaments/${dataset.tournament.alias}`;

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

    const matchPath = pathname.match(
      /^\/organizations\/[^/]+\/tournaments\/[^/]+\/stages\/(\d+)\/matches\/(\d+)$/,
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

    const clubEmblemPath = pathname.match(/^\/organizations\/[^/]+\/clubs\/([^/]+)\/emblem$/);
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

    sendJson(response, 404, { statusCode: 404, message: 'Not found' });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Fixture API did not bind a TCP port');

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fixture = await startPerformanceFixtureApi();
  process.stdout.write(`${fixture.url}\n`);
  process.on('SIGINT', () => void fixture.close().finally(() => process.exit(0)));
  process.on('SIGTERM', () => void fixture.close().finally(() => process.exit(0)));
}
