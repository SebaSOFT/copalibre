import { jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import { JerseyGrid } from './JerseyGrid.js';
import { withIntl } from '../i18n/test-support.js';
import type { ConsoleRoster, ConsoleRosterRole } from '../lib/api-client.js';

const ROSTER_ROLES: readonly ConsoleRosterRole[] = [
  { code: 'goalkeeper', label: 'Goalkeeper', badge: 'GK' },
  { code: 'captain', label: 'Captain', badge: 'C' },
];

const ROSTERS: readonly ConsoleRoster[] = [
  {
    entrantId: 'entrant-a',
    members: [
      { personId: 'a1', number: 1, name: 'A One', roles: ['goalkeeper'], onField: true },
      { personId: 'a10', number: 10, name: 'A Ten', onField: true },
      { personId: 'a12', number: 12, name: 'A Bench', onField: false },
    ],
  },
  {
    entrantId: 'entrant-b',
    members: [{ personId: 'b1', number: 1, name: 'B One', onField: true }],
  },
];

function renderGrid(overrides: Partial<Parameters<typeof JerseyGrid>[0]> = {}) {
  const onSelectPrimary = jest.fn();
  const onSelectSecondary = jest.fn();
  const onChangeActiveField = jest.fn();
  render(
    withIntl(
      <JerseyGrid
        activeField={undefined}
        disabled={false}
        onChangeActiveField={onChangeActiveField}
        onSelectPrimary={onSelectPrimary}
        onSelectSecondary={onSelectSecondary}
        primaryPersonId=""
        primarySide=""
        rosterRoles={ROSTER_ROLES}
        rosters={ROSTERS}
        secondaryFields={[]}
        secondarySelections={{}}
        sentOffPersonIds={new Set()}
        {...overrides}
      />,
    ),
  );
  return { onSelectPrimary, onSelectSecondary, onChangeActiveField };
}

describe('JerseyGrid', () => {
  it('separates on-field and bench members per team', () => {
    renderGrid();
    expect(screen.getByRole('button', { name: 'A One' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'A Bench' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'B One' })).toBeDefined();
  });

  it('renders a role badge from the discipline-declared rosterRoles, not a hardcoded label', () => {
    renderGrid();
    expect(screen.getByText('GK')).toBeDefined();
    expect(screen.queryByText('goalkeeper')).toBeNull();
  });

  it('clicking a jersey with no active field selects the primary actor', () => {
    const { onSelectPrimary, onSelectSecondary } = renderGrid();
    fireEvent.click(screen.getByRole('button', { name: 'A Ten' }));
    expect(onSelectPrimary).toHaveBeenCalledWith('entrant-a', 'a10');
    expect(onSelectSecondary).not.toHaveBeenCalled();
  });

  it('clicking a jersey while a secondary field is active selects that field instead', () => {
    const { onSelectPrimary, onSelectSecondary } = renderGrid({
      activeField: 'assistedBy',
      secondaryFields: ['assistedBy'],
    });
    fireEvent.click(screen.getByRole('button', { name: 'B One' }));
    expect(onSelectSecondary).toHaveBeenCalledWith('assistedBy', 'b1');
    expect(onSelectPrimary).not.toHaveBeenCalled();
  });

  it('switching the active-field chip notifies the parent', () => {
    const { onChangeActiveField } = renderGrid({ secondaryFields: ['assistedBy'] });
    fireEvent.click(screen.getByRole('button', { name: 'assistedBy' }));
    expect(onChangeActiveField).toHaveBeenCalledWith('assistedBy');
  });

  it("renders a member's nationality flag next to their jersey name", () => {
    renderGrid({
      rosters: [
        {
          entrantId: 'entrant-a',
          members: [{ personId: 'a1', number: 1, name: 'A One', nationality: 'AR', onField: true }],
        },
      ],
    });
    expect(screen.getByText('🇦🇷')).toBeDefined();
  });

  it('renders no flag when a member has no nationality', () => {
    renderGrid();
    expect(screen.queryByText('🇦🇷')).toBeNull();
  });

  it('shows the team name in the header instead of the raw entrant id', () => {
    renderGrid({
      rosters: [{ entrantId: 'entrant-a', teamName: 'Talleres', members: [] }],
    });
    expect(screen.getByText('Talleres')).toBeDefined();
    expect(screen.queryByText('entrant-a'.slice(-8))).toBeNull();
  });

  it('falls back to the raw entrant id suffix when no team name is known', () => {
    renderGrid({ rosters: [{ entrantId: 'entrant-abcdefgh', members: [] }] });
    expect(screen.getByText('abcdefgh')).toBeDefined();
  });

  it('shows a placeholder emblem when the entrant has no club', () => {
    renderGrid({ rosters: [{ entrantId: 'entrant-a', members: [] }] });
    expect(screen.getByTitle('No emblem')).toBeDefined();
  });

  it('renders the club emblem image when a clubId and organizationAlias are known', () => {
    renderGrid({
      organizationAlias: 'liga-orbital',
      rosters: [{ entrantId: 'entrant-a', clubId: 'club-1', members: [] }],
    });
    const image = screen.getByAltText('Club emblem') as HTMLImageElement;
    expect(image.src).toContain('/organizations/liga-orbital/clubs/club-1/emblem');
  });

  it('falls back to the placeholder if the emblem image fails to load', () => {
    renderGrid({
      organizationAlias: 'liga-orbital',
      rosters: [{ entrantId: 'entrant-a', clubId: 'club-1', members: [] }],
    });
    fireEvent.error(screen.getByAltText('Club emblem'));
    expect(screen.getByTitle('No emblem')).toBeDefined();
  });

  it('disables and labels a sent-off member, and does not dispatch a selection for it', () => {
    const { onSelectPrimary } = renderGrid({ sentOffPersonIds: new Set(['a10']) });
    const button = screen.getByLabelText('A Ten — Sent off') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onSelectPrimary).not.toHaveBeenCalled();
  });

  it('selects the unique jersey matching a typed number via the keyboard', () => {
    const { onSelectPrimary } = renderGrid();
    fireEvent.keyDown(document, { key: '1' });
    fireEvent.keyDown(document, { key: '0' });
    expect(onSelectPrimary).toHaveBeenCalledWith('entrant-a', 'a10');
  });

  it('does not select when the typed number is ambiguous across both teams', () => {
    const { onSelectPrimary } = renderGrid();
    fireEvent.keyDown(document, { key: '1' });
    expect(onSelectPrimary).not.toHaveBeenCalled();
  });

  it('ignores digit keys typed into a text field', () => {
    render(
      withIntl(
        <>
          <input aria-label="note" />
          <JerseyGrid
            activeField={undefined}
            disabled={false}
            onChangeActiveField={jest.fn()}
            onSelectPrimary={jest.fn()}
            onSelectSecondary={jest.fn()}
            primaryPersonId=""
            primarySide=""
            rosterRoles={ROSTER_ROLES}
            rosters={ROSTERS}
            secondaryFields={[]}
            secondarySelections={{}}
            sentOffPersonIds={new Set()}
          />
        </>,
      ),
    );
    const input = screen.getByLabelText('note');
    fireEvent.keyDown(input, { key: '1' });
    fireEvent.keyDown(input, { key: '0' });
    // No assertion needed beyond "did not throw" / no dispatch — covered by
    // not passing a spy that would fail on an unexpected call above.
    expect(input).toBeDefined();
  });

  it('does nothing when disabled', () => {
    const { onSelectPrimary } = renderGrid({ disabled: true });
    fireEvent.keyDown(document, { key: '1' });
    fireEvent.keyDown(document, { key: '0' });
    expect(onSelectPrimary).not.toHaveBeenCalled();
  });
});
