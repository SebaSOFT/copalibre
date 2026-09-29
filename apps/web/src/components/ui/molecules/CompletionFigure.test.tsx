import { render, screen, within } from '@testing-library/react';
import { CompletionFigure } from './CompletionFigure.tsx';
import type { CompletionFigureLabels } from '../../../lib/i18n/public-intl.ts';

const SAMPLE_LABELS: CompletionFigureLabels = {
  heading: 'Tournament Progress',
  summary: '18 of 32 matches played',
  stateLabel: 'In progress',
  stateGlyph: '◐',
  unmeasuredLabel: 'No matches scheduled',
};

const COMPLETE_LABELS: CompletionFigureLabels = {
  heading: 'Tournament Progress',
  summary: '32 of 32 matches played',
  stateLabel: 'Complete',
  stateGlyph: '✓',
  unmeasuredLabel: 'No matches scheduled',
};

const UNMEASURED_LABELS: CompletionFigureLabels = {
  heading: 'Tournament Progress',
  summary: '0 of 0 matches played',
  stateLabel: 'No matches scheduled',
  stateGlyph: '—',
  unmeasuredLabel: 'No matches scheduled',
};

describe('the CompletionFigure component', () => {
  it('renders partially complete state with non-colour cue (glyph and label)', () => {
    render(<CompletionFigure totalMatches={32} resolvedMatches={18} labels={SAMPLE_LABELS} />);

    expect(screen.getByText('Tournament Progress')).not.toBeNull();
    expect(screen.getByText('18 of 32 matches played')).not.toBeNull();
    expect(screen.getByText('In progress')).not.toBeNull();
    expect(screen.getByText('◐')).not.toBeNull();
  });

  it('renders fully complete state with checkmark glyph and complete label', () => {
    render(<CompletionFigure totalMatches={32} resolvedMatches={32} labels={COMPLETE_LABELS} />);

    expect(screen.getByText('32 of 32 matches played')).not.toBeNull();
    expect(screen.getByText('Complete')).not.toBeNull();
    expect(screen.getByText('✓')).not.toBeNull();
  });

  it('renders zero-match/unmeasured state with unmeasured label instead of bare numbers', () => {
    render(<CompletionFigure totalMatches={0} resolvedMatches={0} labels={UNMEASURED_LABELS} />);

    expect(screen.getAllByText('No matches scheduled').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('—')).not.toBeNull();
  });

  it('renders per-stage breakdown when multiple stages are provided', () => {
    const stages = [
      {
        stageId: 'stage-1',
        stageNumber: 1,
        stageName: 'Group Stage',
        totalMatches: 24,
        resolvedMatches: 18,
      },
      {
        stageId: 'stage-2',
        stageNumber: 2,
        stageName: 'Playoffs',
        totalMatches: 8,
        resolvedMatches: 0,
      },
    ];

    render(
      <CompletionFigure
        totalMatches={32}
        resolvedMatches={18}
        stages={stages}
        labels={SAMPLE_LABELS}
      />,
    );

    const list = screen.getByRole('list');
    expect(within(list).getByText('Group Stage')).not.toBeNull();
    expect(within(list).getByText('18 / 24')).not.toBeNull();
    expect(within(list).getByText('Playoffs')).not.toBeNull();
    expect(within(list).getByText('0 / 8')).not.toBeNull();
  });

  it('omits per-stage list when only one stage is present', () => {
    const stages = [
      {
        stageId: 'stage-1',
        stageNumber: 1,
        stageName: 'Single Stage',
        totalMatches: 10,
        resolvedMatches: 5,
      },
    ];

    render(
      <CompletionFigure
        totalMatches={10}
        resolvedMatches={5}
        stages={stages}
        labels={SAMPLE_LABELS}
      />,
    );

    expect(screen.queryByRole('list')).toBeNull();
  });
});
