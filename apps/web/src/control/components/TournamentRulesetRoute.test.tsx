import { jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TournamentRulesetRoute } from './TournamentRulesetRoute.js';
import { withIntl } from '../i18n/test-support.js';
import type { ControlApiClient } from '../lib/api-client.js';

function stubClient(overrides: Partial<ControlApiClient> = {}): ControlApiClient {
  return {
    fetchRulesetOverrides: () =>
      Promise.resolve({ overrides: { 'scoring.pointsPerWin': 3, 'scoring.pointsPerDraw': 1 } }),
    ...overrides,
  } as unknown as ControlApiClient;
}

describe('TournamentRulesetRoute', () => {
  it('loads and shows the current override fields', async () => {
    render(
      withIntl(
        <TournamentRulesetRoute
          client={stubClient()}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    expect(await screen.findByLabelText('scoring.pointsPerWin')).toBeDefined();
    expect((screen.getByLabelText('scoring.pointsPerWin') as HTMLInputElement).value).toBe('3');
    expect((screen.getByLabelText('scoring.pointsPerDraw') as HTMLInputElement).value).toBe('1');
  });

  it('shows a load-failure message when the ruleset fails to load', async () => {
    render(
      withIntl(
        <TournamentRulesetRoute
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
        <TournamentRulesetRoute
          client={stubClient({ previewRulesetOverrides })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByLabelText('scoring.pointsPerWin');
    fireEvent.change(screen.getByLabelText('scoring.pointsPerWin'), { target: { value: '4' } });
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
      () => Promise.resolve({ overrides: {} }),
    );
    render(
      withIntl(
        <TournamentRulesetRoute
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

    await screen.findByLabelText('scoring.pointsPerWin');
    fireEvent.change(screen.getByLabelText('scoring.pointsPerWin'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    await screen.findByText(/audited correction workflow/);
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
    expect(updateRulesetOverrides).not.toHaveBeenCalled();
  });

  it('adds a new field and saves it', async () => {
    const updateRulesetOverrides = jest.fn<NonNullable<ControlApiClient['updateRulesetOverrides']>>(
      () =>
        Promise.resolve({
          overrides: { 'scoring.pointsPerWin': 3, 'scoring.pointsPerDraw': 1, winCondition: {} },
        }),
    );
    render(
      withIntl(
        <TournamentRulesetRoute
          client={stubClient({ updateRulesetOverrides })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByLabelText('scoring.pointsPerWin');
    fireEvent.change(screen.getByLabelText('Field (dot-path)'), {
      target: { value: 'winCondition' },
    });
    fireEvent.change(screen.getByLabelText('Value (JSON)'), { target: { value: '{}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add field' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(updateRulesetOverrides).toHaveBeenCalledWith('liga-mendocina', 'apertura-2026', {
        overrides: { winCondition: {} },
      }),
    );
    expect(await screen.findByText('Settings saved.')).toBeDefined();
  });

  it('ignores an empty or duplicate new-field name, and skips a malformed value on save', async () => {
    const updateRulesetOverrides = jest.fn<NonNullable<ControlApiClient['updateRulesetOverrides']>>(
      () =>
        Promise.resolve({
          overrides: { 'scoring.pointsPerWin': 3, 'scoring.pointsPerDraw': 1, winCondition: {} },
        }),
    );
    render(
      withIntl(
        <TournamentRulesetRoute
          client={stubClient({ updateRulesetOverrides })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByLabelText('scoring.pointsPerWin');
    expect((screen.getByRole('button', { name: 'Add field' }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    // Already present from the initial load — the duplicate guard makes this a no-op.
    fireEvent.change(screen.getByLabelText('Field (dot-path)'), {
      target: { value: 'scoring.pointsPerWin' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add field' }));
    expect(screen.getAllByLabelText('scoring.pointsPerWin')).toHaveLength(1);

    fireEvent.change(screen.getByLabelText('Field (dot-path)'), {
      target: { value: 'winCondition' },
    });
    fireEvent.change(screen.getByLabelText('Value (JSON)'), { target: { value: '{}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add field' }));

    // A malformed JSON value on the pre-existing field is skipped, not sent.
    fireEvent.change(screen.getByLabelText('scoring.pointsPerWin'), {
      target: { value: 'not-json' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(updateRulesetOverrides).toHaveBeenCalledWith('liga-mendocina', 'apertura-2026', {
        overrides: { winCondition: {} },
      }),
    );
  });

  it('does nothing when preview/save are unavailable on the client', async () => {
    render(
      withIntl(
        <TournamentRulesetRoute
          client={stubClient({
            previewRulesetOverrides: undefined,
            updateRulesetOverrides: undefined,
          })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByLabelText('scoring.pointsPerWin');
    fireEvent.change(screen.getByLabelText('scoring.pointsPerWin'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    // Neither call throws or crashes the screen; the fields remain as edited.
    await waitFor(() =>
      expect((screen.getByLabelText('scoring.pointsPerWin') as HTMLInputElement).value).toBe('4'),
    );
  });

  it('does nothing when saving with no changed fields', async () => {
    const updateRulesetOverrides = jest.fn<NonNullable<ControlApiClient['updateRulesetOverrides']>>(
      () => Promise.resolve({ overrides: {} }),
    );
    render(
      withIntl(
        <TournamentRulesetRoute
          client={stubClient({ updateRulesetOverrides })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByLabelText('scoring.pointsPerWin');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(updateRulesetOverrides).not.toHaveBeenCalled();
  });

  it('adds a field with no typed value, defaulting to an empty string', async () => {
    render(
      withIntl(
        <TournamentRulesetRoute
          client={stubClient()}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByLabelText('scoring.pointsPerWin');
    fireEvent.change(screen.getByLabelText('Field (dot-path)'), {
      target: { value: 'venuePolicy.neutralGround' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add field' }));

    expect((screen.getByLabelText('venuePolicy.neutralGround') as HTMLInputElement).value).toBe(
      '""',
    );
  });

  it('renders a field with neither mutationClass nor blocked as safe', async () => {
    render(
      withIntl(
        <TournamentRulesetRoute
          client={stubClient({
            previewRulesetOverrides: () =>
              Promise.resolve({ fields: [{ field: 'scoring.pointsPerWin' }] }),
          })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByLabelText('scoring.pointsPerWin');
    fireEvent.change(screen.getByLabelText('scoring.pointsPerWin'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    expect(await screen.findByText(/Safe/)).toBeDefined();
  });

  it('removes a field from the draft list', async () => {
    render(
      withIntl(
        <TournamentRulesetRoute
          client={stubClient()}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByLabelText('scoring.pointsPerWin');
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0] as HTMLButtonElement);

    expect(screen.queryByLabelText('scoring.pointsPerWin')).toBeNull();
  });

  it('reports an error when saving fails', async () => {
    render(
      withIntl(
        <TournamentRulesetRoute
          client={stubClient({
            updateRulesetOverrides: () => Promise.reject(new Error('conflict')),
          })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByLabelText('scoring.pointsPerWin');
    fireEvent.change(screen.getByLabelText('scoring.pointsPerWin'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('conflict')).toBeDefined();
  });

  it('reports an error when previewing fails', async () => {
    render(
      withIntl(
        <TournamentRulesetRoute
          client={stubClient({
            previewRulesetOverrides: () => Promise.reject(new Error('preview down')),
          })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByLabelText('scoring.pointsPerWin');
    fireEvent.change(screen.getByLabelText('scoring.pointsPerWin'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

    expect(await screen.findByText('preview down')).toBeDefined();
  });

  it('links to the tournament settings screen', async () => {
    render(
      withIntl(
        <TournamentRulesetRoute
          client={stubClient()}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await screen.findByLabelText('scoring.pointsPerWin');
    const link = screen.getByRole('link', { name: 'Tournament settings' }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe(
      '/control/liga-mendocina/tournaments/apertura-2026/settings',
    );
  });
});
