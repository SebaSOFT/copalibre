import { jest } from '@jest/globals';
import { expectFirstReadFailure } from './resilient-read.test-support.js';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PersonProfilePage } from '../pages/PersonProfilePage.js';
import { withIntl } from '../../i18n/test-support.js';
import type { ControlApiClient, PersonResponse } from '../../lib/api-client.js';
import { clearResilientReadCache } from './use-resilient-read.js';

function stubClient(person: PersonResponse): ControlApiClient {
  return { getPerson: () => Promise.resolve(person) } as unknown as ControlApiClient;
}

describe('PersonProfilePage', () => {
  beforeEach(() => clearResilientReadCache());

  it("shows the person's display name, flag, and natural key", async () => {
    render(
      withIntl(
        <PersonProfilePage
          client={stubClient({
            personId: 'person-1',
            displayName: 'Elías Salomón',
            nationality: 'AR',
            hiddenFromPublic: false,
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

  it('hides and restores a person from public pages without changing their results', async () => {
    const setPublicVisibility = jest.fn(
      async (_organizationAlias: string, personId: string, hiddenFromPublic: boolean) => ({
        personId,
        hiddenFromPublic,
      }),
    );
    const client = {
      getPerson: () =>
        Promise.resolve({
          personId: 'person-1',
          displayName: 'Elías Salomón',
          hiddenFromPublic: false,
        }),
      setPersonPublicVisibility: setPublicVisibility,
    } as unknown as ControlApiClient;
    render(
      withIntl(
        <PersonProfilePage client={client} organizationAlias="liga-orbital" personId="person-1" />,
      ),
    );

    await screen.findByText('Elías Salomón');
    const visibility = screen.getByRole('checkbox', {
      name: 'Hidden from public pages',
    });
    expect(visibility.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(visibility);
    await waitFor(() => {
      expect(setPublicVisibility).toHaveBeenNthCalledWith(1, 'liga-orbital', 'person-1', true);
      expect(visibility.getAttribute('aria-checked')).toBe('true');
    });
    expect(await screen.findByText('Public visibility updated.')).toBeDefined();

    fireEvent.click(visibility);
    await waitFor(() => {
      expect(setPublicVisibility).toHaveBeenNthCalledWith(2, 'liga-orbital', 'person-1', false);
      expect(visibility.getAttribute('aria-checked')).toBe('false');
    });
    expect(screen.getByText('Elías Salomón')).toBeDefined();
  });

  it('keeps a person visible when a privacy update fails and shows the reason', async () => {
    const setPublicVisibility = jest.fn(async () => {
      throw new Error('visibility write failed');
    });
    const client = {
      getPerson: () =>
        Promise.resolve({
          personId: 'person-1',
          displayName: 'Elías Salomón',
          hiddenFromPublic: false,
        }),
      setPersonPublicVisibility: setPublicVisibility,
    } as unknown as ControlApiClient;
    render(
      withIntl(
        <PersonProfilePage client={client} organizationAlias="liga-orbital" personId="person-1" />,
      ),
    );

    const visibility = await screen.findByRole('checkbox', {
      name: 'Hidden from public pages',
    });
    fireEvent.click(visibility);

    expect(await screen.findByText('visibility write failed')).toBeDefined();
    expect(visibility.getAttribute('aria-checked')).toBe('false');
    expect(setPublicVisibility).toHaveBeenCalledWith('liga-orbital', 'person-1', true);
  });

  it('shows a placeholder photo and "not recorded" fields when nothing is set', async () => {
    render(
      withIntl(
        <PersonProfilePage
          client={stubClient({
            personId: 'person-1',
            displayName: 'Tomás Scibilia',
            hiddenFromPublic: false,
          })}
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

  it('falls back to the placeholder when the photo fails to load', async () => {
    render(
      withIntl(
        <PersonProfilePage
          client={stubClient({
            personId: 'person-1',
            displayName: 'Elías Salomón',
            photoObjectId: 'object-1',
            hiddenFromPublic: false,
          })}
          organizationAlias="liga-orbital"
          personId="person-1"
        />,
      ),
    );

    await waitFor(() => screen.getByText('Elías Salomón'));
    const photo = screen.getByAltText('Elías Salomón’s photo');
    fireEvent.error(photo);
    expect(screen.getByTitle('No photo uploaded')).toBeDefined();
  });

  it('shows a load-failed message when the client rejects', async () => {
    const client = {
      getPerson: () => Promise.reject(new Error('boom')),
    } as unknown as ControlApiClient;
    render(
      withIntl(
        <PersonProfilePage client={client} organizationAlias="liga-orbital" personId="person-1" />,
      ),
    );

    await expectFirstReadFailure();
  });

  it('keeps the last successful profile visible and marks it stale when a later read fails', async () => {
    const firstRead = render(
      withIntl(
        <PersonProfilePage
          client={stubClient({
            personId: 'person-1',
            displayName: 'Elías Salomón',
            hiddenFromPublic: false,
          })}
          organizationAlias="stale-profile-league"
          personId="person-1"
        />,
      ),
    );
    await screen.findByText('Elías Salomón');
    firstRead.unmount();

    const { container } = render(
      withIntl(
        <PersonProfilePage
          client={
            {
              getPerson: () => Promise.reject(new Error('network down')),
            } as unknown as ControlApiClient
          }
          organizationAlias="stale-profile-league"
          personId="person-1"
        />,
      ),
    );

    expect(await screen.findByText('Elías Salomón')).toBeDefined();
    await waitFor(() =>
      expect(container.querySelector('.cl-stale-mark')?.textContent).toContain('Stale'),
    );
  });

  it('renders within ListScreenLayout structure', async () => {
    const { container } = render(
      withIntl(
        <PersonProfilePage
          client={stubClient({
            personId: 'person-1',
            displayName: 'Elías Salomón',
            nationality: 'AR',
            hiddenFromPublic: false,
          })}
          organizationAlias="liga-orbital"
          personId="person-1"
        />,
      ),
    );

    await waitFor(() => screen.getByText('Elías Salomón'));
    expect(container.querySelector('.cl-list-screen')).not.toBeNull();
    expect(container.querySelector('.cl-page-header')).not.toBeNull();
    expect(container.querySelector('.cl-list-screen__listing')).not.toBeNull();
  });
});
