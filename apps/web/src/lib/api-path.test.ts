import {
  clubEmblemUrl as controlClubEmblemUrl,
  createControlApiClient,
  organizationEmblemUrl as controlOrganizationEmblemUrl,
  personPhotoUrl,
  tournamentEmblemUrl as controlTournamentEmblemUrl,
} from '../control/lib/api-client.js';
import { selectDisciplineBackground } from './discipline-background.ts';
import {
  personPhotoUrl as publicPersonPhotoUrl,
  tournamentEmblemUrl as publicTournamentEmblemUrl,
} from './public-api-client.ts';
import { clubEmblemUrl, organizationEmblemUrl } from './public-image-paths.ts';

describe('browser-side API paths', () => {
  it.each([
    ['organization emblem', organizationEmblemUrl('liga')],
    ['club emblem', clubEmblemUrl('liga', 'club-1')],
    ['tournament emblem', publicTournamentEmblemUrl('liga', 'copa')],
    ['person photo', publicPersonPhotoUrl('liga', 'copa', 'p-1')],
    ['control organization emblem', controlOrganizationEmblemUrl('liga')],
    ['control club emblem', controlClubEmblemUrl('liga', 'club-1')],
    ['control tournament emblem', controlTournamentEmblemUrl('liga', 'copa')],
    ['control person photo', personPhotoUrl('liga', 'p-1')],
    ['discipline background', selectDisciplineBackground([{ key: 'k' }], () => 0)?.url ?? ''],
  ])('puts the %s under /api', (_name, url) => {
    expect(url.startsWith('/api/')).toBe(true);
  });

  it('keeps event streams out of /api, on the client that adds it to everything else', async () => {
    const urls: string[] = [];
    const client = createControlApiClient({
      fetch: ((url: string) => {
        urls.push(url);
        return Promise.resolve(new Response('[]', { status: 200 }));
      }) as unknown as typeof fetch,
    });

    await client.listDisciplines();

    expect(urls).toEqual(['/api/disciplines']);
    expect(client.controlStream?.('liga').url).toBe('/events/control/liga');
    expect(client.matchConsoleStream?.('liga').url).toBe('/events/control/liga');
  });
});
