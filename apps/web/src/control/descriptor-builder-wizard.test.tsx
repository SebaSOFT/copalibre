import { fireEvent, render, screen } from '@testing-library/react';
import { DescriptorBuilderWizard } from './components/DescriptorBuilderWizard.js';
import { withIntl } from './i18n/test-support.js';

function goToParticipantsStep(): void {
  fireEvent.change(screen.getByLabelText('Alias'), { target: { value: 'test-sport' } });
  fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'Test Sport' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.change(screen.getByLabelText('Author'), { target: { value: 'Test Author' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
}

describe('the discipline builder wizard', () => {
  it('shows a persistent explanation for the alias decision, bound to the field', () => {
    render(withIntl(<DescriptorBuilderWizard />));
    const alias = screen.getByLabelText('Alias');
    expect(alias.getAttribute('aria-describedby')).toBe('descriptor-alias-hint');
    expect(screen.getByText(/The stable identity this discipline installs under/)).toBeDefined();
  });

  it('refuses to continue past the name step without an English name', () => {
    render(withIntl(<DescriptorBuilderWizard />));
    fireEvent.change(screen.getByLabelText('Alias'), { target: { value: 'test-sport' } });
    const continueButton = screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement;
    expect(continueButton.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'Test Sport' } });
    expect(continueButton.disabled).toBe(false);
  });

  it('refuses a reserved-looking submission client-side until participant types are chosen', () => {
    render(withIntl(<DescriptorBuilderWizard />));
    goToParticipantsStep();
    expect(screen.getByText('Participants')).toBeDefined();
    const continueButton = screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement;
    expect(continueButton.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('team'));
    expect(continueButton.disabled).toBe(false);
  });

  it('adds and removes a segment type from the list', () => {
    render(withIntl(<DescriptorBuilderWizard />));
    goToParticipantsStep();
    fireEvent.change(screen.getByLabelText('Segment name'), { target: { value: 'half' } });
    fireEvent.change(screen.getByLabelText('Segment label'), { target: { value: 'Half' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText(/half — Half/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.queryByText(/half — Half/)).toBeNull();
  });

  it('shows server-side validation failures when the parent passes them', () => {
    render(
      withIntl(
        <DescriptorBuilderWizard
          failures={[
            { stage: 'reserved-alias', field: 'alias', message: '"football" is reserved' },
          ]}
        />,
      ),
    );
    expect(screen.getByTestId('descriptor-server-failures').textContent).toContain(
      '"football" is reserved',
    );
  });

  it('walks every step — translations, both participant types, statistics, an event that awards one of them, formats, scoring inputs, and a segmented win condition — and submits the composed document', () => {
    const submitted: unknown[] = [];
    render(withIntl(<DescriptorBuilderWizard onSubmit={(request) => submitted.push(request)} />));

    // Name step: alias, version, localized name and description.
    fireEvent.change(screen.getByLabelText('Alias'), { target: { value: 'e2e-tennis' } });
    fireEvent.change(screen.getByLabelText('Version'), { target: { value: '1.2.0' } });
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'Tennis' } });
    fireEvent.change(screen.getByLabelText('Name (es)'), { target: { value: 'Tenis' } });
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Racquet sport decided by sets' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Authorship step.
    fireEvent.change(screen.getByLabelText('Author'), { target: { value: 'E2E Author' } });
    fireEvent.change(screen.getByLabelText('Licence'), { target: { value: 'CC-BY-4.0' } });
    fireEvent.change(screen.getByLabelText('Source URL (optional)'), {
      target: { value: 'https://example.test/tennis' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Participants step: both types, roster bounds, mid-tournament changes, one segment type.
    fireEvent.click(screen.getByLabelText('individual', { exact: true }));
    fireEvent.click(screen.getByLabelText('team', { exact: true }));
    fireEvent.change(screen.getByLabelText('Minimum players'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Maximum players'), { target: { value: '1' } });
    fireEvent.click(screen.getByLabelText('Allow roster changes mid-tournament'));
    fireEvent.change(screen.getByLabelText('Segment name'), { target: { value: 'set' } });
    fireEvent.change(screen.getByLabelText('Segment label'), { target: { value: 'Set' } });
    fireEvent.click(screen.getByLabelText('Timed'));
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText(/set — Set \(timed\)/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Statistics & events step: two statistics, an event with no award, an
    // event that awards one of the declared statistics, one removed.
    fireEvent.change(screen.getByLabelText('Statistic code'), { target: { value: 'points' } });
    fireEvent.change(screen.getByLabelText('Statistic label'), { target: { value: 'Points' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0] as HTMLButtonElement);
    fireEvent.change(screen.getByLabelText('Statistic code'), { target: { value: 'aces' } });
    fireEvent.change(screen.getByLabelText('Statistic label'), { target: { value: 'Aces' } });
    fireEvent.change(screen.getByLabelText('Aggregation mode'), { target: { value: 'count' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0] as HTMLButtonElement);
    expect(screen.getByText(/points — Points \(sum\)/)).toBeDefined();
    expect(screen.getByText(/aces — Aces \(count\)/)).toBeDefined();

    fireEvent.change(screen.getByLabelText('Event code'), { target: { value: 'let' } });
    fireEvent.change(screen.getByLabelText('Event label'), { target: { value: 'Let' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[1] as HTMLButtonElement);
    expect(screen.getByText(/let — Let \(positive\)/)).toBeDefined();

    fireEvent.change(screen.getByLabelText('Event code'), { target: { value: 'ace' } });
    fireEvent.change(screen.getByLabelText('Event label'), { target: { value: 'Ace' } });
    fireEvent.change(screen.getByLabelText('Event category'), { target: { value: 'positive' } });
    fireEvent.change(screen.getByLabelText('Actor requirement'), { target: { value: 'person' } });
    fireEvent.change(screen.getByLabelText('Awards statistic'), { target: { value: 'aces' } });
    fireEvent.change(screen.getByLabelText('Amount awarded'), { target: { value: '1' } });
    fireEvent.click(screen.getByLabelText('set', { exact: true }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[1] as HTMLButtonElement);
    expect(screen.getByText(/ace — Ace \(positive\) → \+1 aces/)).toBeDefined();

    // Two statistics' Remove buttons render before the events list's — the
    // "let" event (added first, no award) is the third Remove button overall.
    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    fireEvent.click(removeButtons[2] as HTMLButtonElement);
    expect(screen.queryByText(/let — Let \(positive\)/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Formats step: two formats, one scoring input.
    fireEvent.click(screen.getByLabelText('single-elimination', { exact: true }));
    fireEvent.click(screen.getByLabelText('round-robin', { exact: true }));
    fireEvent.change(screen.getByLabelText('Scoring input code'), {
      target: { value: 'challenge' },
    });
    fireEvent.change(screen.getByLabelText('Scoring input label'), {
      target: { value: 'Challenge used' },
    });
    fireEvent.change(screen.getByLabelText('Scoring input source'), {
      target: { value: 'operator-entered' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText(/challenge — Challenge used \(operator-entered\)/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Win condition step: segmented mode with margin, tiebreak, and a
    // winMatch unit naming the segment `winSegment` just closed.
    fireEvent.change(screen.getByLabelText('Win condition shape'), {
      target: { value: 'segmented' },
    });
    fireEvent.change(screen.getByLabelText('Margin required to close a segment (optional)'), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText('Segment that closes'), { target: { value: 'set' } });
    fireEvent.change(screen.getByLabelText('Units needed to close the segment'), {
      target: { value: '6' },
    });
    fireEvent.change(screen.getByLabelText('Tiebreak triggers at (optional)'), {
      target: { value: '6' },
    });
    fireEvent.change(screen.getByLabelText('Tiebreak target (optional)'), {
      target: { value: '7' },
    });
    fireEvent.change(screen.getByLabelText('Tiebreak margin (optional)'), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText('Segment counted to decide the match'), {
      target: { value: 'set' },
    });
    fireEvent.change(screen.getByLabelText('Target needed to win (optional)'), {
      target: { value: '2' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Author and install' }));
    expect(submitted).toHaveLength(1);
    const request = submitted[0] as {
      kind: string;
      document: {
        alias: string;
        name: unknown;
        description: unknown;
        participantTypes: string[];
        statistics: unknown[];
        eventDefinitions: { code: string; effects?: unknown[] }[];
        availableFormats: string[];
        scoringInputs: unknown[];
        winCondition: { rules: { actions: { type: string }[] }[] };
      };
    };
    expect(request.kind).toBe('discipline');
    expect(request.document.alias).toBe('e2e-tennis');
    expect(request.document.name).toEqual({ en: 'Tennis', es: 'Tenis' });
    expect(request.document.participantTypes.sort()).toEqual(['individual', 'team']);
    expect(request.document.statistics).toHaveLength(2);
    expect(request.document.eventDefinitions).toHaveLength(1);
    expect(request.document.eventDefinitions[0]?.effects).toEqual([
      { kind: 'statistic', statisticCode: 'aces', delta: 1, awardTo: 'actor' },
    ]);
    expect(request.document.availableFormats.sort()).toEqual(['round-robin', 'single-elimination']);
    expect(request.document.scoringInputs).toHaveLength(1);
    expect(
      request.document.winCondition.rules.flatMap((rule) => rule.actions.map((a) => a.type)),
    ).toEqual(['requireMargin', 'winSegment', 'winMatch']);
  });
});
