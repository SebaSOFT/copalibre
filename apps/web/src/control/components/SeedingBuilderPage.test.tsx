import { render, screen, waitFor } from '@testing-library/react';
import { SeedingBuilderPage } from './SeedingBuilderPage.js';
import { withIntl } from '../i18n/test-support.js';

describe('SeedingBuilderPage (0147 template migration)', () => {
  it('renders within ListScreenTemplate structure and displays seeding order and bracket canvas', async () => {
    const { container } = render(
      withIntl(
        <SeedingBuilderPage
          hasRecordedResults={false}
          matches={[]}
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
});
