import { fireEvent, render, screen } from '@testing-library/react';
import { ProfileBuilderWizard } from './components/ProfileBuilderWizard.js';
import { withIntl } from './i18n/test-support.js';
import type { DisciplineOption } from './lib/wizard.js';

const DISCIPLINES: readonly DisciplineOption[] = [
  {
    descriptorId: 'd-football',
    alias: 'football',
    version: '1.0.0',
    name: 'Football',
    supportedFormats: ['round-robin', 'single-elimination'],
  },
];

function goToStagesStep(): void {
  fireEvent.change(screen.getByLabelText('Alias'), { target: { value: 'test-cup' } });
  fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'Test Cup' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.change(screen.getByLabelText('Author'), { target: { value: 'Test Author' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
}

describe('the tournament profile builder wizard', () => {
  it('shows a persistent explanation for the discipline decision, bound to the field', () => {
    render(withIntl(<ProfileBuilderWizard disciplines={DISCIPLINES} />));
    goToStagesStep();
    const discipline = screen.getByLabelText('Check stage formats against');
    expect(discipline.getAttribute('aria-describedby')).toBe('profile-discipline-hint');
    expect(
      screen.getByText(/The installed discipline each stage’s format is checked against/),
    ).toBeDefined();
  });

  it('shows the missing-English-name problem once — as the field error while English is active, in the checklist once it is not', () => {
    render(withIntl(<ProfileBuilderWizard disciplines={DISCIPLINES} />));
    expect(screen.getAllByText('An English name is required.')).toHaveLength(1);
    fireEvent.click(screen.getAllByRole('tab', { name: 'Español' })[0] as HTMLButtonElement);
    expect(screen.getAllByText('An English name is required.')).toHaveLength(1);
  });

  it('only offers stage formats the chosen discipline declares', () => {
    render(withIntl(<ProfileBuilderWizard disciplines={DISCIPLINES} />));
    goToStagesStep();
    fireEvent.change(screen.getByLabelText('Check stage formats against'), {
      target: { value: 'football' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add stage' }));
    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options).toContain('round-robin');
    expect(options).toContain('single-elimination');
    expect(options).not.toContain('league');
  });

  it('walks every step — translations, two stages with one removed, and points — and submits the composed document', () => {
    const submitted: unknown[] = [];
    render(
      withIntl(
        <ProfileBuilderWizard
          disciplines={DISCIPLINES}
          onSubmit={(request) => submitted.push(request)}
        />,
      ),
    );

    // Name step: alias, version, localized name and description.
    fireEvent.change(screen.getByLabelText('Alias'), { target: { value: 'e2e-cup' } });
    fireEvent.change(screen.getByLabelText('Version'), { target: { value: '1.1.0' } });
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'E2E Cup' } });
    fireEvent.click(screen.getAllByRole('tab', { name: 'Español' })[0] as HTMLButtonElement);
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'Copa E2E' } });
    fireEvent.click(screen.getAllByRole('tab', { name: 'English' })[0] as HTMLButtonElement);
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'A multi-stage cup' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Authorship step.
    fireEvent.change(screen.getByLabelText('Author'), { target: { value: 'E2E Author' } });
    fireEvent.change(screen.getByLabelText('Licence'), { target: { value: 'CC-BY-4.0' } });
    fireEvent.change(screen.getByLabelText('Source URL (optional)'), {
      target: { value: 'https://example.test/cup' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Stages step: two stages added, one removed, one kept.
    fireEvent.change(screen.getByLabelText('Check stage formats against'), {
      target: { value: 'football' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add stage' }));
    fireEvent.change(screen.getAllByLabelText('Stage name')[0] as HTMLInputElement, {
      target: { value: 'Playoffs' },
    });
    fireEvent.change(screen.getAllByLabelText('Stage format')[0] as HTMLSelectElement, {
      target: { value: 'single-elimination' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add stage' }));
    fireEvent.change(screen.getAllByLabelText('Stage name')[1] as HTMLInputElement, {
      target: { value: 'Groups' },
    });
    fireEvent.change(screen.getAllByLabelText('Stage format')[1] as HTMLSelectElement, {
      target: { value: 'round-robin' },
    });
    expect(screen.getByDisplayValue('Playoffs')).toBeDefined();
    expect(screen.getByDisplayValue('Groups')).toBeDefined();

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0] as HTMLButtonElement);
    expect(screen.queryByDisplayValue('Playoffs')).toBeNull();
    expect(screen.getByDisplayValue('Groups')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Points step.
    fireEvent.change(screen.getByLabelText('Points for a win'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Points for a draw'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Points for a loss'), { target: { value: '0' } });

    fireEvent.click(screen.getByRole('button', { name: 'Author and install' }));
    expect(submitted).toHaveLength(1);
    const request = submitted[0] as {
      disciplineAlias: string;
      document: { alias: string; name: unknown; stages: unknown[]; points: unknown };
    };
    expect(request.disciplineAlias).toBe('football');
    expect(request.document.alias).toBe('e2e-cup');
    expect(request.document.name).toEqual({ en: 'E2E Cup', es: 'Copa E2E' });
    expect(request.document.stages).toEqual([{ number: 1, name: 'Groups', format: 'round-robin' }]);
    expect(request.document.points).toEqual({ win: 2, draw: 1, loss: 0 });
  });

  it('declares a per-stage allocation default and carries it into the submitted document', () => {
    const submitted: unknown[] = [];
    render(
      withIntl(
        <ProfileBuilderWizard
          disciplines={DISCIPLINES}
          onSubmit={(request) => submitted.push(request)}
        />,
      ),
    );
    fireEvent.change(screen.getByLabelText('Alias'), { target: { value: 'seeded-cup' } });
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'Seeded Cup' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.change(screen.getByLabelText('Author'), { target: { value: 'Author' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    fireEvent.change(screen.getByLabelText('Check stage formats against'), {
      target: { value: 'football' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add stage' }));
    fireEvent.change(screen.getByLabelText('Stage name'), { target: { value: 'Groups' } });
    fireEvent.change(screen.getByLabelText('Stage format'), { target: { value: 'round-robin' } });
    fireEvent.change(screen.getByLabelText('Seeding'), { target: { value: 'automatic' } });

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Author and install' }));

    expect(submitted).toHaveLength(1);
    const request = submitted[0] as { document: { stages: readonly unknown[] } };
    expect(request.document.stages).toEqual([
      { number: 1, name: 'Groups', format: 'round-robin', allocation: { mode: 'automatic' } },
    ]);
  });

  it('shows server-side validation failures when the parent passes them', () => {
    render(
      withIntl(
        <ProfileBuilderWizard
          disciplines={DISCIPLINES}
          failures={[
            {
              stage: 'profile-format',
              field: 'stages[0].format',
              message: 'not among declared formats',
            },
          ]}
        />,
      ),
    );
    expect(screen.getByTestId('profile-server-failures').textContent).toContain(
      'not among declared formats',
    );
  });
});
