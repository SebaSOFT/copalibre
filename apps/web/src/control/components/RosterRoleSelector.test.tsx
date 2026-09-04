import { render, screen, fireEvent } from '@testing-library/react';
import { jest } from '@jest/globals';
import { RosterRoleSelector, type RosterMemberItem } from './RosterRoleSelector.js';

describe('RosterRoleSelector', () => {
  const sampleMembers: readonly RosterMemberItem[] = [
    {
      personId: 'p-1',
      displayName: 'Lionel Messi',
      role: 'player',
    },
    {
      personId: 'p-2',
      displayName: 'Lionel Scaloni',
      role: 'staff',
    },
  ];

  it('renders all members and their current role badges', () => {
    const onChange = jest.fn();
    render(<RosterRoleSelector members={sampleMembers} onChange={onChange} />);

    expect(screen.getByText('Lionel Messi')).toBeDefined();
    expect(screen.getByText('Lionel Scaloni')).toBeDefined();

    expect(screen.getByTestId('role-badge-p-1').textContent).toBe('Jugador');
    expect(screen.getByTestId('role-badge-p-2').textContent).toBe('Staff');
  });

  it('mutates member role to coach on selector change', () => {
    const onChange = jest.fn();
    render(<RosterRoleSelector members={sampleMembers} onChange={onChange} />);

    const select = screen.getByTestId('role-select-p-1') as HTMLSelectElement;
    expect(select.value).toBe('player');

    fireEvent.change(select, { target: { value: 'coach' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([
      {
        personId: 'p-1',
        displayName: 'Lionel Messi',
        role: 'coach',
      },
      {
        personId: 'p-2',
        displayName: 'Lionel Scaloni',
        role: 'staff',
      },
    ]);
  });

  it('mutates member role to substitute on selector change', () => {
    const onChange = jest.fn();
    render(<RosterRoleSelector members={sampleMembers} onChange={onChange} />);

    const select = screen.getByTestId('role-select-p-2') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'substitute' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([
      {
        personId: 'p-1',
        displayName: 'Lionel Messi',
        role: 'player',
      },
      {
        personId: 'p-2',
        displayName: 'Lionel Scaloni',
        role: 'substitute',
      },
    ]);
  });

  it('renders empty state when members array is empty', () => {
    const onChange = jest.fn();
    render(<RosterRoleSelector members={[]} onChange={onChange} />);

    expect(screen.getByText(/No hay miembros/)).toBeDefined();
  });

  it('falls back to personId when displayName is absent', () => {
    const onChange = jest.fn();
    render(
      <RosterRoleSelector
        members={[
          {
            personId: 'p-anon',
            displayName: '',
            role: 'player',
          },
        ]}
        onChange={onChange}
      />,
    );

    expect(screen.getByText('p-anon')).toBeDefined();
    const select = screen.getByTestId('role-select-p-anon');
    fireEvent.change(select, { target: { value: 'coach' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
