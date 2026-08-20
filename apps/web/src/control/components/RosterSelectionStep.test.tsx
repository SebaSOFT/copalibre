import { jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RosterSelectionStep } from './RosterSelectionStep.js';
import { withIntl } from '../i18n/test-support.js';
import {
  ControlApiError,
  type ConsoleRoster,
  type ConsoleRosterRole,
  type MatchConsoleApiClient,
  type MatchConsoleResponse,
  type RosterCandidate,
} from '../lib/api-client.js';

const ROSTER_ROLES: readonly ConsoleRosterRole[] = [
  { code: 'captain', label: 'Captain', badge: 'C' },
];

const CANDIDATES: readonly RosterCandidate[] = [
  { personId: 'p1', name: 'Scorer' },
  { personId: 'p2', name: 'Playmaker' },
];

const PROJECTION = {} as MatchConsoleResponse;

function client(overrides: Partial<MatchConsoleApiClient> = {}): MatchConsoleApiClient {
  return {
    fetchMatchConsole: async () => {
      throw new Error('not used in this test');
    },
    fetchMatchRosters: async () => {
      throw new Error('not used in this test');
    },
    fetchRosterCandidates: async () => CANDIDATES,
    setMatchRoster: async () => PROJECTION,
    adjustMatchClock: async () => {
      throw new Error('not used in this test');
    },
    resolveMatchTimer: async () => {
      throw new Error('not used in this test');
    },
    recordMatchEvent: async () => {
      throw new Error('not used in this test');
    },
    finalizeMatch: async () => {
      throw new Error('not used in this test');
    },
    ...overrides,
  };
}

function renderStep(
  overrides: {
    readonly existingRosters?: readonly ConsoleRoster[];
    readonly rosterRoles?: readonly ConsoleRosterRole[];
    readonly entrantIds?: readonly string[];
    readonly api?: MatchConsoleApiClient;
    readonly onSaved?: () => void;
  } = {},
) {
  const onSaved = overrides.onSaved ?? jest.fn();
  const api = overrides.api ?? client();
  render(
    withIntl(
      <RosterSelectionStep
        api={api}
        entrantIds={overrides.entrantIds ?? ['entrant-a']}
        existingRosters={overrides.existingRosters ?? []}
        matchId="match-1"
        onSaved={onSaved}
        organizationAlias="liga-mendocina"
        rosterRoles={overrides.rosterRoles ?? ROSTER_ROLES}
        tournamentAlias="apertura-2026"
      />,
    ),
  );
  return { onSaved, api };
}

describe('RosterSelectionStep', () => {
  it('shows a loading state before candidates arrive, then renders them unselected', async () => {
    renderStep();
    expect(screen.getByText('Loading roster candidates...')).toBeDefined();
    await screen.findByText('Scorer');
    expect(screen.getByText('Playmaker')).toBeDefined();
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.every((box) => !(box as HTMLInputElement).checked)).toBe(true);
  });

  it('seeds selections from an existing roster', async () => {
    renderStep({
      existingRosters: [
        {
          entrantId: 'entrant-a',
          teamName: 'Norte',
          members: [
            { personId: 'p1', number: 9, name: 'Scorer', roles: ['captain'], onField: true },
          ],
        },
      ],
    });
    await screen.findByText('Norte');
    const scorerRow = within(screen.getByText('Scorer').closest('li') as HTMLElement);
    const numberInput = scorerRow.getByPlaceholderText('No.') as HTMLInputElement;
    expect(numberInput.value).toBe('9');
    expect(scorerRow.getByRole('checkbox', { name: 'Scorer' })).toHaveProperty('checked', true);
  });

  it('falls back to the entrant id when no team name is known yet', async () => {
    const entrantId = 'entrant-with-no-roster-1234';
    renderStep({ entrantIds: [entrantId] });
    await screen.findByText('Scorer');
    expect(screen.getByText(entrantId.slice(-8))).toBeDefined();
  });

  it('renders no roles row when the discipline declares none', async () => {
    renderStep({ rosterRoles: [] });
    await screen.findByText('Scorer');
    expect(screen.queryByText('C')).toBeNull();
  });

  it('renders an explicit empty state when the entrant has no registered players', async () => {
    renderStep({ api: client({ fetchRosterCandidates: async () => [] }) });
    await screen.findByText('This entrant has no registered players yet.');
  });

  it('submits only the checked members, with number and roles, and calls onSaved', async () => {
    const setMatchRoster = jest.fn(async () => PROJECTION);
    const { onSaved } = renderStep({ api: client({ setMatchRoster }) });
    await screen.findByText('Scorer');

    const scorerRow = within(screen.getByText('Scorer').closest('li') as HTMLElement);
    fireEvent.click(scorerRow.getByRole('checkbox', { name: 'Scorer' }));
    fireEvent.change(scorerRow.getByPlaceholderText('No.'), { target: { value: '9' } });
    fireEvent.click(scorerRow.getByRole('checkbox', { name: 'On field' }));
    const roleCheckbox = scorerRow.getByRole('checkbox', { name: 'C' });
    fireEvent.click(roleCheckbox); // check
    fireEvent.click(roleCheckbox); // uncheck — exercises the removal branch
    fireEvent.click(roleCheckbox); // check again for the assertion below
    fireEvent.click(screen.getByRole('button', { name: 'Save roster' }));

    await waitFor(() => expect(setMatchRoster).toHaveBeenCalled());
    expect(setMatchRoster).toHaveBeenCalledWith(
      'liga-mendocina',
      'apertura-2026',
      'match-1',
      'entrant-a',
      { members: [{ personId: 'p1', onField: true, number: '9', roles: ['captain'] }] },
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('shows a server-provided message on a refused submission and keeps the entered data', async () => {
    const setMatchRoster = jest.fn(async () => {
      throw new ControlApiError(
        400,
        'Person "p1" is not a registered player of entrant "entrant-a"',
      );
    });
    renderStep({ api: client({ setMatchRoster }) });
    await screen.findByText('Scorer');

    const scorerCheckbox = within(
      screen.getByText('Scorer').closest('li') as HTMLElement,
    ).getByRole('checkbox', {
      name: 'Scorer',
    });
    fireEvent.click(scorerCheckbox);
    fireEvent.click(screen.getByRole('button', { name: 'Save roster' }));

    await screen.findByText('Person "p1" is not a registered player of entrant "entrant-a"');
    // Entered data survives the refusal.
    expect((scorerCheckbox as HTMLInputElement).checked).toBe(true);
  });

  it('falls back to a generic message when the failure is not a ControlApiError', async () => {
    const setMatchRoster = jest.fn(async () => {
      throw new Error('network down');
    });
    renderStep({ api: client({ setMatchRoster }) });
    await screen.findByText('Scorer');
    fireEvent.click(screen.getByRole('button', { name: 'Save roster' }));
    await screen.findByText('Could not save the roster.');
  });

  it('shows a load-failure message when candidates cannot be fetched', async () => {
    renderStep({
      api: client({
        fetchRosterCandidates: async () => {
          throw new Error('offline');
        },
      }),
    });
    await screen.findByText('Could not load roster candidates.');
  });

  it('renders one independent editor per entrant', async () => {
    renderStep({ entrantIds: ['entrant-a', 'entrant-b'] });
    await screen.findAllByText('Scorer');
    expect(screen.getAllByText('Scorer')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Save roster' })).toHaveLength(2);
  });
});
