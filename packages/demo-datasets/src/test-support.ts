import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { DemoDataset } from './types.js';

/** A PNG header (signature and IHDR) of the given size; enough for the validator, not decodable. */
export function pngHeader(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

export const PNG_BYTES = pngHeader(410, 512);

/** The smallest dataset that is valid: two teams, one group, one played game with a goal each. */
export function minimalDataset(): DemoDataset {
  return {
    schemaVersion: 1,
    alias: 'tiny-cup',
    name: 'Tiny Cup',
    discipline: { alias: 'rink-hockey', version: '1.1.0' },
    organization: {
      alias: 'tiny-demo',
      name: 'Tiny Demo',
      description: 'Demo data, not an official record.',
      primaryLanguage: 'es',
      timezone: 'America/Argentina/Buenos_Aires',
    },
    tournament: {
      alias: 'tiny-cup-2025',
      name: 'Tiny Cup 2025',
      season: '2025',
      emblem: 'emblems/tournament.png',
    },
    clubs: [
      {
        alias: 'club-uno',
        name: 'Club Uno',
        abbreviation: 'UNO',
        emblem: 'emblems/clubs/club-uno.png',
      },
      {
        alias: 'club-dos',
        name: 'Club Dos',
        abbreviation: 'DOS',
        emblem: 'emblems/clubs/club-dos.png',
      },
    ],
    teams: [
      { alias: 'club-uno', clubAlias: 'club-uno', name: 'Club Uno', abbreviation: 'UNO' },
      { alias: 'club-dos', clubAlias: 'club-dos', name: 'Club Dos', abbreviation: 'DOS' },
    ],
    players: [
      {
        alias: 'ana-lopez',
        teamAlias: 'club-uno',
        givenNames: 'Ana',
        surname: 'Lopez',
        dorsal: 7,
        nationality: 'AR',
        roles: ['captain'],
        goals: 1,
        assists: 0,
      },
      {
        alias: 'bruno-vega',
        teamAlias: 'club-dos',
        givenNames: 'Bruno',
        surname: 'Vega',
        dorsal: 9,
        roles: [],
        goals: 1,
        assists: 0,
      },
    ],
    phases: [
      { alias: 'grupo-a', name: 'Grupo A', kind: 'group', teamAliases: ['club-uno', 'club-dos'] },
    ],
    venues: [{ alias: 'aldo-cantoni', name: 'Aldo Cantoni' }],
    games: [
      {
        key: 'game-1',
        phaseAlias: 'grupo-a',
        roundNumber: 1,
        round: 'Jornada 1',
        homeTeamAlias: 'club-uno',
        awayTeamAlias: 'club-dos',
        scheduledAt: '2025-11-05T17:45',
        venueAlias: 'aldo-cantoni',
        homeGoals: 1,
        awayGoals: 1,
        officials: [{ givenNames: 'Carlos', surname: 'Rios' }],
        scorerKnown: true,
        events: [
          {
            period: 'P1',
            clock: '03:10',
            teamAlias: 'club-uno',
            type: 'goal',
            playerAlias: 'ana-lopez',
          },
          {
            period: 'P2',
            clock: '11:02',
            teamAlias: 'club-dos',
            type: 'goal',
            playerAlias: 'bruno-vega',
          },
        ],
      },
    ],
  };
}

export interface WriteOptions {
  readonly source?: boolean;
  readonly emblems?: readonly string[];
  readonly raw?: string;
}

/** Writes a dataset directory into a fresh temp dir and returns its path. */
export async function writeDatasetDirectory(
  document: unknown,
  options: WriteOptions = {},
): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'demo-dataset-'));
  await writeFile(path.join(directory, 'dataset.json'), options.raw ?? JSON.stringify(document));
  if (options.source !== false) await writeFile(path.join(directory, 'source.md'), '# Source\n');
  for (const emblem of options.emblems ?? [
    'emblems/tournament.png',
    'emblems/clubs/club-uno.png',
    'emblems/clubs/club-dos.png',
  ]) {
    await mkdir(path.dirname(path.join(directory, emblem)), { recursive: true });
    await writeFile(path.join(directory, emblem), PNG_BYTES);
  }
  return directory;
}
