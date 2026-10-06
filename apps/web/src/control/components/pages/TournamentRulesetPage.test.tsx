import { jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TournamentRulesetPage } from '../pages/TournamentRulesetPage.js';
import { withIntl } from '../../i18n/test-support.js';
import type { ControlApiClient } from '../../lib/api-client.js';

function stubClient(overrides: Partial<ControlApiClient> = {}): ControlApiClient {
  return {
    fetchRulesetOverrides: () =>
      Promise.resolve({
        overrides: { 'scoring.pointsPerWin': 3, 'scoring.pointsPerDraw': 1 },
        fieldPolicies: {
          'scoring.pointsPerWin': {
            permission: { kind: 'replaced' },
            mutationClass: 'blocked_after_results',
            label: 'Points per win',
          },
          'scoring.pointsPerLoss': {
            permission: { kind: 'replaced' },
            mutationClass: 'safe',
            label: 'Points per loss',
          },
        },
        disciplineDefaults: { scoring: { pointsPerWin: 2, pointsPerLoss: 0 } },
      }),
    ...overrides,
  } as unknown as ControlApiClient;
}

describe('TournamentRulesetPage', () => {
  it('loads and shows the current override fields', async () => {
    render(
      withIntl(
        <TournamentRulesetPage
          client={stubClient()}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    expect(await screen.findByLabelText('Points per win')).toBeDefined();
    expect((screen.getByLabelText('Points per win') as HTMLInputElement).value).toBe('3');
    expect(screen.getByText('scoring.pointsPerDraw')).toBeDefined();
    expect(screen.queryByRole('spinbutton', { name: 'scoring.pointsPerDraw' })).toBeNull();
  });

  it("shows the discipline's plain-language rule context alongside the edit fields", async () => {
    render(
      withIntl(
        <TournamentRulesetPage
          client={stubClient()}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    expect(await screen.findByText('Rules')).toBeDefined();
    // Appears twice now: the read-only summary's label, and the editor field's own label.
    expect(screen.getAllByText('Points per win').length).toBeGreaterThanOrEqual(1);
    // The tournament's override (3) is shown, not the discipline default (2).
    expect(screen.getByText('Current value: 3')).toBeDefined();
    expect(screen.queryByText('Segments')).toBeNull();
    expect(screen.queryByText('Events')).toBeNull();
  });

  it('shows a load-failure message when the ruleset fails to load', async () => {
    render(
      withIntl(
        <TournamentRulesetPage
          client={stubClient({
            fetchRulesetOverrides: () => Promise.reject(new Error('network down')),
          })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    expect(await screen.findByText('Could not load the tournament settings.')).toBeDefined();
  });

  it('previews a changed field and reports its classification', async () => {
    const previewRulesetOverrides = jest.fn<
      NonNullable<ControlApiClient['previewRulesetOverrides']>
    >(() =>
      Promise.resolve({
        fields: [
          { field: 'scoring.pointsPerWin', mutationClass: 'blocked_after_results' as const },
        ],
      }),
    );
    render(
      withIntl(
        <TournamentRulesetPage
          client={stubClient({ previewRulesetOverrides })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByLabelText('Points per win');
    fireEvent.change(screen.getByLabelText('Points per win'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    await waitFor(() =>
      expect(previewRulesetOverrides).toHaveBeenCalledWith('liga-mendocina', 'apertura-2026', {
        overrides: { 'scoring.pointsPerWin': 4 },
      }),
    );
    expect(await screen.findByText(/Blocked after results/)).toBeDefined();
  });

  it('refuses to save once the preview reports a blocked field', async () => {
    const updateRulesetOverrides = jest.fn<NonNullable<ControlApiClient['updateRulesetOverrides']>>(
      () => Promise.resolve({ overrides: {}, fieldPolicies: {}, disciplineDefaults: {} }),
    );
    render(
      withIntl(
        <TournamentRulesetPage
          client={stubClient({
            previewRulesetOverrides: () =>
              Promise.resolve({
                fields: [
                  {
                    field: 'scoring.pointsPerWin',
                    blocked: true,
                    reason: 'Blocked after results; use the audited correction workflow',
                  },
                ],
              }),
            updateRulesetOverrides,
          })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByLabelText('Points per win');
    fireEvent.change(screen.getByLabelText('Points per win'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    await screen.findByText(/audited correction workflow/);
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
    expect(updateRulesetOverrides).not.toHaveBeenCalled();
  });

  it('adds a declared numeric field and saves it', async () => {
    const updateRulesetOverrides = jest.fn<NonNullable<ControlApiClient['updateRulesetOverrides']>>(
      () =>
        Promise.resolve({
          overrides: { 'scoring.pointsPerWin': 3, 'scoring.pointsPerDraw': 1, winCondition: {} },
          fieldPolicies: {},
          disciplineDefaults: {},
        }),
    );
    render(
      withIntl(
        <TournamentRulesetPage
          client={stubClient({ updateRulesetOverrides })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByLabelText('Points per win');
    fireEvent.change(screen.getByLabelText('Field (dot-path)'), {
      target: { value: 'scoring.pointsPerLoss' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add field' }));
    fireEvent.change(screen.getByLabelText('Points per loss'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(updateRulesetOverrides).toHaveBeenCalledWith('liga-mendocina', 'apertura-2026', {
        overrides: { 'scoring.pointsPerLoss': 2 },
      }),
    );
    expect(await screen.findByText('Settings saved.')).toBeDefined();
  });

  it('ignores an empty or duplicate new-field name', async () => {
    render(
      withIntl(
        <TournamentRulesetPage
          client={stubClient()}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByLabelText('Points per win');
    expect((screen.getByRole('button', { name: 'Add field' }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    // Already present from the initial load — the duplicate guard makes this a no-op.
    fireEvent.change(screen.getByLabelText('Field (dot-path)'), {
      target: { value: 'scoring.pointsPerWin' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add field' }));
    expect(screen.getAllByLabelText('Points per win')).toHaveLength(1);
  });

  it('does not offer a raw-JSON editor for a field without a declared policy', async () => {
    render(
      withIntl(
        <TournamentRulesetPage
          client={stubClient()}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByText('scoring.pointsPerDraw');
    expect(
      screen.getByText('Not governed by a known rule policy; editing is unavailable.'),
    ).toBeDefined();
    expect(screen.queryByRole('textbox', { name: 'scoring.pointsPerDraw' })).toBeNull();
  });

  it('does nothing when preview/save are unavailable on the client', async () => {
    render(
      withIntl(
        <TournamentRulesetPage
          client={stubClient({
            previewRulesetOverrides: undefined,
            updateRulesetOverrides: undefined,
          })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByLabelText('Points per win');
    fireEvent.change(screen.getByLabelText('Points per win'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    // Neither call throws or crashes the screen; the fields remain as edited.
    await waitFor(() =>
      expect((screen.getByLabelText('Points per win') as HTMLInputElement).value).toBe('4'),
    );
  });

  it('does nothing when saving with no changed fields', async () => {
    const updateRulesetOverrides = jest.fn<NonNullable<ControlApiClient['updateRulesetOverrides']>>(
      () => Promise.resolve({ overrides: {}, fieldPolicies: {}, disciplineDefaults: {} }),
    );
    render(
      withIntl(
        <TournamentRulesetPage
          client={stubClient({ updateRulesetOverrides })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByLabelText('Points per win');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(updateRulesetOverrides).not.toHaveBeenCalled();
  });

  it('does not expose an undeclared null value as raw JSON', async () => {
    render(
      withIntl(
        <TournamentRulesetPage
          client={stubClient()}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByLabelText('Points per win');
    fireEvent.change(screen.getByLabelText('Field (dot-path)'), {
      target: { value: 'venuePolicy.neutralGround' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add field' }));

    expect(screen.getByText('venuePolicy.neutralGround')).toBeDefined();
    expect(screen.queryByDisplayValue('null')).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'venuePolicy.neutralGround' })).toBeNull();
  });

  it('renders a field with neither mutationClass nor blocked as safe', async () => {
    render(
      withIntl(
        <TournamentRulesetPage
          client={stubClient({
            previewRulesetOverrides: () =>
              Promise.resolve({ fields: [{ field: 'scoring.pointsPerWin' }] }),
          })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByLabelText('Points per win');
    fireEvent.change(screen.getByLabelText('Points per win'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    expect(await screen.findByText(/Safe/)).toBeDefined();
  });

  it('removes a field from the draft list', async () => {
    render(
      withIntl(
        <TournamentRulesetPage
          client={stubClient()}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByLabelText('Points per win');
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0] as HTMLButtonElement);

    expect(screen.queryByLabelText('Points per win')).toBeNull();
  });

  it('reports an error when saving fails', async () => {
    render(
      withIntl(
        <TournamentRulesetPage
          client={stubClient({
            updateRulesetOverrides: () => Promise.reject(new Error('conflict')),
          })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByLabelText('Points per win');
    fireEvent.change(screen.getByLabelText('Points per win'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('conflict')).toBeDefined();
  });

  it('reports an error when previewing fails', async () => {
    render(
      withIntl(
        <TournamentRulesetPage
          client={stubClient({
            previewRulesetOverrides: () => Promise.reject(new Error('preview down')),
          })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByLabelText('Points per win');
    fireEvent.change(screen.getByLabelText('Points per win'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    expect(await screen.findByText('preview down')).toBeDefined();
  });

  it('folds the sibling tournament-settings fetch into the plain-language summary (openspec 0267)', async () => {
    render(
      withIntl(
        <TournamentRulesetPage
          client={stubClient({
            fetchTournamentSettings: () =>
              Promise.resolve({ name: 'Copa Orbital', region: 'South Sector', featured: false }),
          })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    expect(await screen.findByText('Copa Orbital')).toBeDefined();
    expect(screen.getByText('Region: South Sector')).toBeDefined();
  });

  it('renders the summary from the ruleset alone when the client offers no settings fetch', async () => {
    render(
      withIntl(
        <TournamentRulesetPage
          client={stubClient()}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    // Falls back to the tournament alias — the only name-like fact available
    // without the sibling fetch.
    expect(await screen.findByText('apertura-2026')).toBeDefined();
  });

  it('links to the tournament settings screen', async () => {
    render(
      withIntl(
        <TournamentRulesetPage
          client={stubClient()}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByLabelText('Points per win');
    const link = screen.getByRole('link', { name: 'Tournament settings' }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe(
      '/control/liga-mendocina/tournaments/apertura-2026/settings',
    );
  });

  it('saves a boolean field as a real boolean, not a JSON-encoded string', async () => {
    const updateRulesetOverrides = jest.fn<NonNullable<ControlApiClient['updateRulesetOverrides']>>(
      () => Promise.resolve({ overrides: {}, fieldPolicies: {}, disciplineDefaults: {} }),
    );
    render(
      withIntl(
        <TournamentRulesetPage
          client={stubClient({
            fetchRulesetOverrides: () =>
              Promise.resolve({
                overrides: { 'venuePolicy.neutralGround': false },
                fieldPolicies: {
                  'venuePolicy.neutralGround': {
                    permission: { kind: 'replaced' },
                    mutationClass: 'safe',
                    label: 'Neutral ground required',
                  },
                },
                disciplineDefaults: {},
              }),
            updateRulesetOverrides,
          })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByLabelText('Neutral ground required');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(updateRulesetOverrides).toHaveBeenCalledWith('liga-mendocina', 'apertura-2026', {
        overrides: { 'venuePolicy.neutralGround': true },
      }),
    );
  });

  it('saves a union-list field as only the added items, never the inherited ones', async () => {
    const updateRulesetOverrides = jest.fn<NonNullable<ControlApiClient['updateRulesetOverrides']>>(
      () => Promise.resolve({ overrides: {}, fieldPolicies: {}, disciplineDefaults: {} }),
    );
    render(
      withIntl(
        <TournamentRulesetPage
          client={stubClient({
            fetchRulesetOverrides: () =>
              Promise.resolve({
                overrides: { tiebreakers: [] },
                fieldPolicies: {
                  tiebreakers: {
                    permission: { kind: 'merged', strategy: 'union-list' },
                    mutationClass: 'requires_rebuild',
                    label: 'Tiebreakers',
                  },
                },
                disciplineDefaults: { tiebreakers: ['points', 'score-difference'] },
              }),
            updateRulesetOverrides,
          })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    fireEvent.change(await screen.findByLabelText('Tiebreakers'), {
      target: { value: 'goals-against' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(updateRulesetOverrides).toHaveBeenCalledWith('liga-mendocina', 'apertura-2026', {
        overrides: { tiebreakers: ['goals-against'] },
      }),
    );
  });
});
