/**
 * openspec 0248 task 1.4/2.3: the operator standings screen's Phase → Zone →
 * Group navigation was already implemented (`StandingsPage.tsx`'s
 * `listZones`/`listGroups` load effect, flattening every zone's groups into
 * one selector, labelled `Zone / Group` only once more than one zone exists)
 * — this change did not add that mechanism, it only found it undocumented.
 * These tests are the coverage that mechanism never had.
 */
import { act, render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { StandingsPage } from './components/pages/StandingsPage.js';
import type { ControlApiClient, GroupResponse, ZoneResponse } from './lib/api-client.js';
import { ORG, TOURNAMENT, projection, storyClient } from './components/screen-story-fixtures.js';

function renderPage(client: ControlApiClient) {
  return render(
    <IntlProvider locale="en" messages={{}}>
      <StandingsPage
        client={client}
        organizationAlias={ORG}
        stageNumber={1}
        tournamentAlias={TOURNAMENT}
      />
    </IntlProvider>,
  );
}

async function flush(): Promise<void> {
  await act(() => Promise.resolve());
}

describe('the operator standings screen Phase → Zone → Group navigation', () => {
  it('renders no group selector for a single-implicit-group stage (one zone, one group)', async () => {
    const zones: readonly ZoneResponse[] = [
      { zoneId: 'z1', stageId: 's1', number: 1, name: 'Zone 1' },
    ];
    const groups: readonly GroupResponse[] = [
      { groupId: 'g1', zoneId: 'z1', number: 1, name: 'Group A' },
    ];
    const client = storyClient<ControlApiClient>({
      fetchTableLayouts: () =>
        Promise.resolve([
          {
            code: projection.layoutCode,
            target: projection.target,
            label: projection.label,
            entityGranularity: 'team',
          },
        ]),
      fetchTableProjection: () => Promise.resolve(projection),
      listZones: () => Promise.resolve(zones),
      listGroups: () => Promise.resolve(groups),
      downloadTableProjectionCsv: undefined,
    });
    renderPage(client);
    await flush();
    expect(screen.queryByLabelText('Group')).toBeNull();
  });

  it('flattens every group across every zone, labelling each "Zone / Group" once more than one zone exists', async () => {
    const zones: readonly ZoneResponse[] = [
      { zoneId: 'z1', stageId: 's1', number: 1, name: 'Zone 1' },
      { zoneId: 'z2', stageId: 's1', number: 2, name: 'Zone 2' },
    ];
    const groupsByZone: Readonly<Record<string, readonly GroupResponse[]>> = {
      z1: [
        { groupId: 'g1', zoneId: 'z1', number: 1, name: 'Group A' },
        { groupId: 'g2', zoneId: 'z1', number: 2, name: 'Group B' },
      ],
      z2: [{ groupId: 'g3', zoneId: 'z2', number: 1, name: 'Group A' }],
    };
    const client = storyClient<ControlApiClient>({
      fetchTableLayouts: () =>
        Promise.resolve([
          {
            code: projection.layoutCode,
            target: projection.target,
            label: projection.label,
            entityGranularity: 'team',
          },
        ]),
      fetchTableProjection: () => Promise.resolve(projection),
      listZones: () => Promise.resolve(zones),
      listGroups: (_org, _tournament, _stage, zoneNumber) =>
        Promise.resolve(groupsByZone[zoneNumber === 1 ? 'z1' : 'z2'] ?? []),
      downloadTableProjectionCsv: undefined,
    });
    renderPage(client);
    await flush();
    const select = await screen.findByLabelText('Group');
    const optionLabels = Array.from(select.querySelectorAll('option')).map(
      (option) => option.textContent,
    );
    // Arbitrary Z (2 zones) and G (2 then 1 groups) — every group surfaces, each
    // qualified by its own zone's name, not just the ones from a fixed layout.
    expect(optionLabels).toEqual(['Zone 1 / Group A', 'Zone 1 / Group B', 'Zone 2 / Group A']);
  });

  it('re-scopes the projection fetch to the selected group when the operator switches groups', async () => {
    const zones: readonly ZoneResponse[] = [
      { zoneId: 'z1', stageId: 's1', number: 1, name: 'Zone 1' },
    ];
    const groups: readonly GroupResponse[] = [
      { groupId: 'g1', zoneId: 'z1', number: 1, name: 'Group A' },
      { groupId: 'g2', zoneId: 'z1', number: 2, name: 'Group B' },
    ];
    const scopesRequested: unknown[] = [];
    const client = storyClient<ControlApiClient>({
      fetchTableLayouts: () =>
        Promise.resolve([
          {
            code: projection.layoutCode,
            target: projection.target,
            label: projection.label,
            entityGranularity: 'team',
          },
        ]),
      fetchTableProjection: (_org, _tournament, _layoutCode, scope) => {
        scopesRequested.push(scope);
        return Promise.resolve(projection);
      },
      listZones: () => Promise.resolve(zones),
      listGroups: () => Promise.resolve(groups),
      downloadTableProjectionCsv: undefined,
    });
    renderPage(client);
    const select = (await screen.findByLabelText('Group')) as HTMLSelectElement;
    await act(async () => {
      select.dispatchEvent(new Event('focus'));
    });
    const optionB = Array.from(select.querySelectorAll('option')).find(
      (option) => option.textContent === 'Group B',
    ) as HTMLOptionElement;
    await act(async () => {
      select.value = optionB.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(scopesRequested.at(-1)).toEqual({ stageNumber: 1, groupId: 'g2' });
  });
});
