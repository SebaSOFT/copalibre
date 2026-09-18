import { render, screen, waitFor } from '@testing-library/react';
import { SeedingBuilderTemplate } from '../screens/SeedingBuilderTemplate.js';
import { withIntl } from '../../i18n/test-support.js';
import type { CanvasMatch } from '../../lib/bracket-canvas.js';

const materializedMatch: CanvasMatch = {
  matchId: 'WB-R1-M1',
  persistedMatchId: 'persisted-match-1',
  bracket: 'winners',
  round: 1,
  position: 1,
  status: 'scheduled',
  slots: [
    { kind: 'entrant', entrantId: 'entrant-1' },
    { kind: 'entrant', entrantId: 'entrant-2' },
  ],
};

describe('SeedingBuilderTemplate', () => {
  it('renders within ListScreenLayout structure and displays seeding order and bracket canvas', async () => {
    const { container } = render(
      withIntl(
        <SeedingBuilderTemplate
          hasRecordedResults={false}
          zones={[]}
          names={{ 'entrant-1': 'Godoy Cruz', 'entrant-2': 'Independiente Rivadavia' }}
          organizationAlias="liga-mendocina"
          seeds={[
            { seed: 1, entrantId: 'entrant-1', locked: false },
            { seed: 2, entrantId: 'entrant-2', locked: true },
          ]}
          tournamentName="Apertura 2026"
        />,
      ),
    );

    await waitFor(() => screen.getByRole('heading', { level: 1, name: /seeding/i }));
    expect(container.querySelector('.cl-list-screen')).not.toBeNull();
    expect(container.querySelector('.cl-list-screen__header')).not.toBeNull();
    expect(container.querySelector('.cl-list-screen__listing')).not.toBeNull();
    expect(screen.getByText('Godoy Cruz')).toBeDefined();
    expect(screen.getByText('Independiente Rivadavia')).toBeDefined();
  });

  it('links its breadcrumb back to the stage hub when a tournament alias and stage number are supplied', async () => {
    render(
      withIntl(
        <SeedingBuilderTemplate
          hasRecordedResults={false}
          zones={[]}
          organizationAlias="liga-mendocina"
          seeds={[]}
          stageNumber={1}
          tournamentAlias="apertura-2026"
          tournamentName="Apertura 2026"
        />,
      ),
    );

    await waitFor(() => screen.getByRole('heading', { level: 1, name: /seeding/i }));
    expect(screen.getByRole('link', { name: 'Stage 1' }).getAttribute('href')).toBe(
      '/control/liga-mendocina/tournaments/apertura-2026/stages/1',
    );
  });

  it('links a resolved bracket node to its match console when a tournament alias is supplied', () => {
    render(
      withIntl(
        <SeedingBuilderTemplate
          hasRecordedResults={false}
          zones={[{ matches: [materializedMatch] }]}
          organizationAlias="liga-mendocina"
          seeds={[{ seed: 1, entrantId: 'entrant-1', locked: false }]}
          tournamentAlias="apertura-2026"
          tournamentName="Apertura 2026"
        />,
      ),
    );

    const link = screen.getByText('WB-R1-M1').closest('a');
    expect(link?.getAttribute('href')).toBe(
      '/control/liga-mendocina/tournaments/apertura-2026/matches/persisted-match-1',
    );
  });

  it('renders a resolved bracket node with no link when no tournament alias is supplied', () => {
    render(
      withIntl(
        <SeedingBuilderTemplate
          hasRecordedResults={false}
          zones={[{ matches: [materializedMatch] }]}
          organizationAlias="liga-mendocina"
          seeds={[{ seed: 1, entrantId: 'entrant-1', locked: false }]}
          tournamentName="Apertura 2026"
        />,
      ),
    );

    expect(screen.getByText('WB-R1-M1').closest('a')).toBeNull();
  });
});
