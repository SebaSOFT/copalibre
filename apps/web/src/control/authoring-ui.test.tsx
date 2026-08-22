import { fireEvent, render, screen } from '@testing-library/react';
import { RegistrationReviewPage } from './components/RegistrationReviewPage.js';
import { TournamentSetupWizard } from './components/TournamentSetupWizard.js';
import { sampleDisciplines, sampleRegistrations } from './lib/sample.js';
import { withIntl } from './i18n/test-support.js';

describe('the tournament setup wizard screen', () => {
  it('gates progression and submits the descriptor version', () => {
    const submitted: unknown[] = [];
    render(
      withIntl(
        <TournamentSetupWizard
          disciplines={sampleDisciplines()}
          onSubmit={(request) => submitted.push(request)}
        />,
      ),
    );

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Copa Verano' } });
    fireEvent.change(screen.getByLabelText('Alias'), { target: { value: 'copa-verano' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByLabelText('Discipline').textContent).toContain('Football');
    expect(screen.getByLabelText('Discipline').textContent).toContain(
      'Team discipline with timed halves and goal-based scoring',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByLabelText('Format').textContent).toContain('single-elimination');
    expect(screen.getByLabelText('Format').textContent).not.toContain('placement');

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create tournament' }));

    expect(submitted).toEqual([
      {
        alias: 'copa-verano',
        name: 'Copa Verano',
        descriptorId: '01890000-0000-7000-8000-000000000001',
        descriptorVersion: '1.2.0',
        format: 'single-elimination',
        publicRegistration: false,
        requiresCheckIn: false,
      },
    ]);
  });
});

describe('the registration review screen', () => {
  it('filters rows, selects visible rows and exposes row details', () => {
    render(
      withIntl(
        <RegistrationReviewPage
          organizationAlias="liga-mendocina"
          tournamentName="apertura-2026"
          rows={sampleRegistrations()}
          now="2026-08-01T17:00:00.000Z"
        />,
      ),
    );

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'pending' } });
    expect(screen.getByText('Talleres Azul')).toBeDefined();
    expect(screen.queryByText('Casa de Italia')).toBeNull();

    fireEvent.click(screen.getByLabelText('Select visible'));
    expect((screen.getByRole('button', { name: 'Approve' }) as HTMLButtonElement).disabled).toBe(
      false,
    );

    fireEvent.click(screen.getByText('Talleres Azul'));
    expect(screen.getByText('delegado@talleres.test')).toBeDefined();
  });

  it('shows the check-in team-membership lock when the server would reject the edit', () => {
    render(
      withIntl(
        <RegistrationReviewPage
          organizationAlias="liga-mendocina"
          tournamentName="apertura-2026"
          rows={sampleRegistrations()}
          now="2026-08-01T19:00:00.000Z"
        />,
      ),
    );

    fireEvent.click(screen.getByText('San Martín'));

    expect(screen.getByText(/Check-in closed/)).toBeDefined();
    expect(
      screen
        .getAllByRole('button', { name: 'Edit members' })
        .some((button) => (button as HTMLButtonElement).disabled),
    ).toBe(true);
  });
});
