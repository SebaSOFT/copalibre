import { render, screen, waitFor } from '@testing-library/react';
import { PersonProfileRoute } from './PersonProfileRoute.js';
import { withIntl } from '../i18n/test-support.js';
import type { ControlApiClient, PersonResponse } from '../lib/api-client.js';

function stubClient(person: PersonResponse): ControlApiClient {
  return { getPerson: () => Promise.resolve(person) } as unknown as ControlApiClient;
}

describe('PersonProfileRoute', () => {
  it("shows the person's display name, flag, and natural key", async () => {
    render(
      withIntl(
        <PersonProfileRoute
          client={stubClient({
            personId: 'person-1',
            displayName: 'Elías Salomón',
            nationality: 'AR',
            naturalKey: { kind: 'dni', value: '12345678' },
          })}
          organizationAlias="liga-orbital"
          personId="person-1"
        />,
      ),
    );

    await waitFor(() => screen.getByText('Elías Salomón'));
    expect(screen.getByText('🇦🇷')).toBeDefined();
    expect(screen.getByText('dni: 12345678')).toBeDefined();
  });

  it('shows a placeholder photo and "not recorded" fields when nothing is set', async () => {
    render(
      withIntl(
        <PersonProfileRoute
          client={stubClient({ personId: 'person-1', displayName: 'Tomás Scibilia' })}
          organizationAlias="liga-orbital"
          personId="person-1"
        />,
      ),
    );

    await waitFor(() => screen.getByText('Tomás Scibilia'));
    expect(screen.getByTitle('No photo uploaded')).toBeDefined();
    expect(screen.getByText('Not recorded')).toBeDefined();
    expect(screen.getByText('Not set')).toBeDefined();
  });

  it('shows a load-failed message when the client rejects', async () => {
    const client = {
      getPerson: () => Promise.reject(new Error('boom')),
    } as unknown as ControlApiClient;
    render(
      withIntl(
        <PersonProfileRoute client={client} organizationAlias="liga-orbital" personId="person-1" />,
      ),
    );

    await waitFor(() => screen.getByText('Could not load this profile.'));
  });
});
