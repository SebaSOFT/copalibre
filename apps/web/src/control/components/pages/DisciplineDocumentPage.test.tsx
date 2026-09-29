import { render, screen } from '@testing-library/react';
import { DisciplineDocumentPage } from './DisciplineDocumentPage.js';
import { withIntl } from '../../i18n/test-support.js';
import type { ControlApiClient } from '../../lib/api-client.js';

function stubClient(overrides: Partial<ControlApiClient> = {}): ControlApiClient {
  return {
    fetchInstalledDisciplineDocument: () =>
      Promise.resolve({
        descriptorId: '01800000-0000-7000-8000-000000000001',
        alias: 'orbital-frisbee',
        version: '1.0.0',
        document: {
          segmentTypes: [
            {
              name: 'regulation',
              label: 'Regulation period',
              timed: true,
              defaultDurationSeconds: 2700,
            },
          ],
          eventDefinitions: [
            {
              code: 'scoring-play',
              label: 'Scoring play',
              actorRequirement: 'side',
              effects: [{ kind: 'score', awardTo: 'actor', delta: 1 }],
            },
          ],
          defaults: { scoring: { pointsPerWin: 3 } },
          fieldPolicies: {
            'scoring.pointsPerWin': {
              permission: { kind: 'replaced' },
              mutationClass: 'blocked_after_results',
              label: 'Points per win',
            },
          },
        },
      }),
    ...overrides,
  } as unknown as ControlApiClient;
}

describe('DisciplineDocumentPage', () => {
  it('loads and shows the plain-language summary for the installed discipline', async () => {
    render(
      withIntl(<DisciplineDocumentPage client={stubClient()} disciplineAlias="orbital-frisbee" />),
    );

    expect(await screen.findByText('Segments')).toBeDefined();
    expect(screen.getByText('Rules')).toBeDefined();
    expect(screen.getByText('Events')).toBeDefined();
    expect(screen.getByText('Points per win')).toBeDefined();
    expect(screen.getByText('Changes the result')).toBeDefined();
  });

  it('shows a load-failure message when the document fails to load', async () => {
    render(
      withIntl(
        <DisciplineDocumentPage
          client={stubClient({
            fetchInstalledDisciplineDocument: () => Promise.reject(new Error('boom')),
          })}
          disciplineAlias="orbital-frisbee"
        />,
      ),
    );

    expect(await screen.findByText('Could not load this discipline.')).toBeDefined();
  });
});
