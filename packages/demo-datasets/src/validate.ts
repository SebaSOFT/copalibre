import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv';
import type { DatasetIssue, DemoDataset } from './types.js';

const DATASET_FILE = 'dataset.json';
const SOURCE_FILE = 'source.md';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** The product's own emblem size: the API refuses any other on upload (within 1%). */
export const EMBLEM_WIDTH = 410;
export const EMBLEM_HEIGHT = 512;
const EMBLEM_TOLERANCE = 0.01;

function within(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) <= expected * EMBLEM_TOLERANCE;
}

let compiled: ValidateFunction | undefined;

async function schemaValidator(): Promise<ValidateFunction> {
  if (compiled) return compiled;
  const schemaUrl = new URL('../schema/dataset.schema.json', import.meta.url);
  const schema: unknown = JSON.parse(await readFile(schemaUrl, 'utf8'));
  compiled = new Ajv({ allErrors: true, strict: false }).compile(schema as object);
  return compiled;
}

function shapeIssues(errors: readonly ErrorObject[]): DatasetIssue[] {
  return errors.map((error) => ({
    file: DATASET_FILE,
    path: error.instancePath || '/',
    message: error.message ?? 'is invalid',
  }));
}

/**
 * Validates a parsed `dataset.json`: its shape against the JSON Schema, then
 * the cross-references the schema cannot express (aliases resolve, scores
 * agree with the recorded goal events).
 */
export async function validateDatasetDocument(document: unknown): Promise<DatasetIssue[]> {
  const shape = await shapeOf(document);
  return shape.length > 0 ? shape : referenceIssues(document as DemoDataset);
}

async function shapeOf(document: unknown): Promise<DatasetIssue[]> {
  const validate = await schemaValidator();
  return validate(document) ? [] : shapeIssues(validate.errors ?? []);
}

function referenceIssues(dataset: DemoDataset): DatasetIssue[] {
  const issues: DatasetIssue[] = [];
  const add = (pointer: string, message: string): void => {
    issues.push({ file: DATASET_FILE, path: pointer, message });
  };
  const unique = (label: string, values: readonly string[]): Set<string> => {
    const seen = new Set<string>();
    values.forEach((value, index) => {
      if (seen.has(value)) add(`/${label}/${index}`, `duplicate alias "${value}"`);
      seen.add(value);
    });
    return seen;
  };

  const clubs = unique(
    'clubs',
    dataset.clubs.map((club) => club.alias),
  );
  const teams = unique(
    'teams',
    dataset.teams.map((team) => team.alias),
  );
  const players = unique(
    'players',
    dataset.players.map((player) => player.alias),
  );
  const phases = unique(
    'phases',
    dataset.phases.map((phase) => phase.alias),
  );
  const venues = unique(
    'venues',
    dataset.venues.map((venue) => venue.alias),
  );
  unique(
    'games',
    dataset.games.map((game) => game.key),
  );

  dataset.teams.forEach((team, index) => {
    if (!clubs.has(team.clubAlias))
      add(`/teams/${index}/clubAlias`, `unknown club "${team.clubAlias}"`);
  });
  const teamOfPlayer = new Map<string, string>();
  dataset.players.forEach((player, index) => {
    teamOfPlayer.set(player.alias, player.teamAlias);
    if (!teams.has(player.teamAlias))
      add(`/players/${index}/teamAlias`, `unknown team "${player.teamAlias}"`);
  });
  dataset.phases.forEach((phase, index) => {
    phase.teamAliases.forEach((alias, teamIndex) => {
      if (!teams.has(alias))
        add(`/phases/${index}/teamAliases/${teamIndex}`, `unknown team "${alias}"`);
    });
  });
  dataset.games.forEach((game, index) => {
    const at = `/games/${index}`;
    if (!phases.has(game.phaseAlias)) add(`${at}/phaseAlias`, `unknown phase "${game.phaseAlias}"`);
    for (const side of ['homeTeamAlias', 'awayTeamAlias'] as const) {
      if (!teams.has(game[side])) add(`${at}/${side}`, `unknown team "${game[side]}"`);
    }
    if (game.venueAlias !== undefined && !venues.has(game.venueAlias))
      add(`${at}/venueAlias`, `unknown venue "${game.venueAlias}"`);
    if (game.homeTeamAlias === game.awayTeamAlias) add(at, 'a team cannot play itself');
    gameEventIssues(game, at, players, teamOfPlayer, add);
  });
  return issues;
}

function gameEventIssues(
  game: DemoDataset['games'][number],
  at: string,
  players: ReadonlySet<string>,
  teamOfPlayer: ReadonlyMap<string, string>,
  add: (pointer: string, message: string) => void,
): void {
  const goals = new Map<string, number>([
    [game.homeTeamAlias, 0],
    [game.awayTeamAlias, 0],
  ]);
  game.events.forEach((event, eventIndex) => {
    const eventAt = `${at}/events/${eventIndex}`;
    if (!goals.has(event.teamAlias))
      add(`${eventAt}/teamAlias`, `"${event.teamAlias}" is not playing in this game`);
    for (const field of ['playerAlias', 'assistAlias'] as const) {
      const alias = event[field];
      if (alias === undefined) continue;
      if (!players.has(alias)) add(`${eventAt}/${field}`, `unknown player "${alias}"`);
      else if (teamOfPlayer.get(alias) !== event.teamAlias)
        add(`${eventAt}/${field}`, `player "${alias}" is not on team "${event.teamAlias}"`);
    }
    if (event.type === 'goal') goals.set(event.teamAlias, (goals.get(event.teamAlias) ?? 0) + 1);
  });
  if (game.scorerKnown) {
    if (goals.get(game.homeTeamAlias) !== game.homeGoals)
      add(`${at}/homeGoals`, 'score does not match the recorded goal events');
    if (goals.get(game.awayTeamAlias) !== game.awayGoals)
      add(`${at}/awayGoals`, 'score does not match the recorded goal events');
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

async function emblemIssues(
  directory: string,
  emblems: readonly { pointer: string; file: string }[],
): Promise<DatasetIssue[]> {
  const issues: DatasetIssue[] = [];
  for (const { pointer, file } of emblems) {
    const absolute = path.join(directory, file);
    if (!(await exists(absolute))) {
      issues.push({
        file: DATASET_FILE,
        path: pointer,
        message: `emblem file "${file}" is missing`,
      });
      continue;
    }
    const bytes = await readFile(absolute);
    if (bytes.length < 24 || !bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
      issues.push({ file, path: '/', message: 'emblem is not a PNG image' });
      continue;
    }
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    if (!within(width, EMBLEM_WIDTH) || !within(height, EMBLEM_HEIGHT)) {
      issues.push({
        file,
        path: '/',
        message: `emblem must be ${EMBLEM_WIDTH}x${EMBLEM_HEIGHT}, found ${width}x${height}`,
      });
    }
  }
  return issues;
}

/** Validates a dataset directory: `dataset.json`, `source.md` and every emblem file. */
export async function validateDatasetDirectory(directory: string): Promise<DatasetIssue[]> {
  const issues: DatasetIssue[] = [];
  if (!(await exists(path.join(directory, SOURCE_FILE))))
    issues.push({ file: SOURCE_FILE, path: '/', message: 'provenance file is missing' });

  let document: unknown;
  try {
    document = JSON.parse(await readFile(path.join(directory, DATASET_FILE), 'utf8'));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return [...issues, { file: DATASET_FILE, path: '/', message: `cannot be read: ${reason}` }];
  }

  const shape = await shapeOf(document);
  if (shape.length > 0) return [...issues, ...shape];

  const dataset = document as DemoDataset;
  issues.push(
    ...referenceIssues(dataset),
    ...(await emblemIssues(directory, [
      { pointer: '/tournament/emblem', file: dataset.tournament.emblem },
      ...dataset.clubs.map((club, index) => ({
        pointer: `/clubs/${index}/emblem`,
        file: club.emblem,
      })),
    ])),
  );
  return issues;
}
