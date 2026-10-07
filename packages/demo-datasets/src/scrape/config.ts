import type { DemoOrganization } from '../types.js';

/** What a scraped competition becomes: the organization, tournament and seed that frame it. */
export interface DatasetConfig {
  readonly alias: string;
  readonly name: string;
  readonly discipline: { readonly alias: string; readonly version: string };
  readonly organization: DemoOrganization;
  readonly tournament: { readonly alias: string; readonly name: string; readonly season: string };
  /** Fixed string that, with a key, selects a replacement surname. Change it and every pseudonym changes. */
  readonly scramblerSeed: string;
}

export const PANAMERICANO_CLUBES_2025: DatasetConfig = {
  alias: 'panamericano-clubes-2025',
  name: 'Campeonato Panamericano Clubes Senior Varones 2025',
  discipline: { alias: 'rink-hockey', version: '1.1.0' },
  organization: {
    alias: 'panamericano-demo',
    name: 'Panamericano Demo',
    description:
      'Demo organization holding a copy of a public results portal, with player surnames replaced. Not an official record.',
    primaryLanguage: 'es',
    timezone: 'America/Argentina/Buenos_Aires',
  },
  tournament: {
    alias: 'panamericano-clubes-2025',
    name: 'Campeonato Panamericano Clubes Senior Varones',
    season: '2025/26',
  },
  scramblerSeed: 'panamericano-clubes-2025/v1',
};
