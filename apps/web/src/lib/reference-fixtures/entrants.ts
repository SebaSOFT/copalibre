/** Reference entrants and clubs for the review fixtures. */

import type { PublicOverviewClubResponse } from '@copalibre/api/src/dto/public-tournament.dto.js';

/** The eight entrants every fixture below draws from. */
export const REFERENCE_ENTRANTS = [
  {
    id: '01936f4a-0001-7000-8000-000000000001',
    name: 'Meridian Seven',
    abbreviation: 'MER',
    alias: 'meridian-seven',
  },
  {
    id: '01936f4a-0002-7000-8000-000000000002',
    name: 'Ironclad Five',
    abbreviation: 'IRO',
    alias: 'ironclad-five',
  },
  {
    id: '01936f4a-0003-7000-8000-000000000003',
    name: 'Obsidian Rift',
    abbreviation: 'OBS',
    alias: 'obsidian-rift',
  },
  {
    id: '01936f4a-0004-7000-8000-000000000004',
    name: 'Echo Squadron',
    abbreviation: 'ECH',
    alias: 'echo-squadron',
  },
  {
    id: '01936f4a-0005-7000-8000-000000000005',
    name: 'Vermilion Wolves',
    abbreviation: 'VER',
    alias: 'vermilion-wolves',
  },
  {
    id: '01936f4a-0006-7000-8000-000000000006',
    name: 'Aurora Vanguard',
    abbreviation: 'AUR',
    alias: 'aurora-vanguard',
  },
  {
    id: '01936f4a-0007-7000-8000-000000000007',
    name: 'Neon Syndicate',
    abbreviation: 'NEO',
    alias: 'neon-syndicate',
  },
  {
    id: '01936f4a-0008-7000-8000-000000000008',
    name: 'Solaris Prime',
    abbreviation: 'SOL',
    alias: 'solaris-prime',
  },
] as const;

/** Two clubs, one with an emblem and one without. */
export function referenceClubs(): PublicOverviewClubResponse[] {
  return [
    {
      clubId: '01936f4a-5001-7000-8000-000000000001',
      name: 'Meridian Athletic',
      alias: 'meridian-athletic',
      abbreviation: 'MER',
    },
    {
      clubId: '01936f4a-5002-7000-8000-000000000002',
      name: 'Ironclad Union',
      alias: 'ironclad-union',
      emblemObjectId: '01936f4a-5000-7000-8000-000000000000',
    },
  ];
}
