import { useCallback, useEffect, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  createControlApiClient,
  type ControlApiClient,
  type OfficialResponse,
  type OfficialRole,
  type VenueResponse,
} from '../lib/api-client.js';
import { controlTokenStore } from '../session/token-store.js';
import { Button } from './ui/atoms/button.js';
import { Card } from './ui/atoms/card.js';
import { Input } from './ui/atoms/input.js';
import { FormField } from './ui/molecules/form-field.js';
import { messages } from '../i18n/messages.en.js';
import { useToast } from './ToastProvider.js';
import { ListScreenTemplate } from './ui/templates/list-screen-template.js';

const OFFICIAL_ROLES: readonly OfficialRole[] = [
  'referee',
  'assistant',
  'table-official',
  'observer',
];

/**
 * Venue and official management — the resource pool a schedule
 * builder assigns from. `tournament-engine/resource-scheduling`'s
 * `createVenue`/`createOfficial` have existed since the capability was
 * accepted; this is the first screen (and the first API route, wired in
 * `apps/api/src/controllers/resources.controller.ts`) that reaches them.
 */
export function VenueManagementRoute({
  organizationAlias,
  client,
}: {
  readonly organizationAlias: string;
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  const intl = useIntl();
  const { push, pushError } = useToast();
  const api = useMemo(
    () =>
      client ??
      createControlApiClient({
        fetch: globalThis.fetch.bind(globalThis),
        accessToken: () => controlTokenStore.read(),
      }),
    [client],
  );

  const [venues, setVenues] = useState<readonly VenueResponse[]>([]);
  const [officials, setOfficials] = useState<readonly OfficialResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const [newVenueName, setNewVenueName] = useState('');
  const [newVenueAlias, setNewVenueAlias] = useState('');
  const [newVenueCapacity, setNewVenueCapacity] = useState('1');

  const [newOfficialName, setNewOfficialName] = useState('');
  const [newOfficialRoles, setNewOfficialRoles] = useState<readonly OfficialRole[]>([]);

  const [selectedVenueId, setSelectedVenueId] = useState<string>();
  const [editVenueName, setEditVenueName] = useState('');
  const [editVenueCapacity, setEditVenueCapacity] = useState('');
  const [editVenueAddress, setEditVenueAddress] = useState('');
  const [editVenueDetails, setEditVenueDetails] = useState<
    readonly { key: string; value: string }[]
  >([]);

  const [selectedOfficialId, setSelectedOfficialId] = useState<string>();
  const [editOfficialName, setEditOfficialName] = useState('');
  const [editOfficialRoles, setEditOfficialRoles] = useState<readonly OfficialRole[]>([]);

  const reload = useCallback(async (): Promise<void> => {
    try {
      const [loadedVenues, loadedOfficials] = await Promise.all([
        api.listVenues?.(organizationAlias) ?? Promise.resolve([]),
        api.listOfficials?.(organizationAlias) ?? Promise.resolve([]),
      ]);
      setVenues(loadedVenues);
      setOfficials(loadedOfficials);
    } catch {
      push({
        severity: 'error',
        message: intl.formatMessage(messages.resourceManagementLoadFailed),
      });
    }
  }, [api, intl, organizationAlias, push]);

  useEffect(() => {
    let live = true;
    Promise.all([
      api.listVenues?.(organizationAlias) ?? Promise.resolve([]),
      api.listOfficials?.(organizationAlias) ?? Promise.resolve([]),
    ])
      .then(([loadedVenues, loadedOfficials]) => {
        if (live) {
          setVenues(loadedVenues);
          setOfficials(loadedOfficials);
        }
      })
      .catch(() => {
        if (live) {
          push({
            severity: 'error',
            message: intl.formatMessage(messages.resourceManagementLoadFailed),
          });
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [api, intl, organizationAlias, push]);

  const selectVenue = (venue: VenueResponse): void => {
    setSelectedVenueId(venue.venueId);
    setEditVenueName(venue.name);
    setEditVenueCapacity(venue.concurrentCapacity ? String(venue.concurrentCapacity) : '');
    setEditVenueAddress(venue.address ?? '');
    setEditVenueDetails(
      venue.details
        ? Object.entries(venue.details).map(([key, value]) => ({ key, value: String(value) }))
        : [],
    );
  };

  const selectOfficial = (official: OfficialResponse): void => {
    setSelectedOfficialId(official.officialId);
    setEditOfficialName(official.displayName);
    setEditOfficialRoles(official.roles);
  };

  const toggleRole = (
    current: readonly OfficialRole[],
    role: OfficialRole,
    set: (next: readonly OfficialRole[]) => void,
  ): void => {
    set(current.includes(role) ? current.filter((r) => r !== role) : [...current, role]);
  };

  async function createVenue(): Promise<void> {
    if (!api.createVenue || newVenueName.trim() === '' || newVenueAlias.trim() === '') return;
    const capacity = parseInt(newVenueCapacity, 10);
    try {
      await api.createVenue(organizationAlias, {
        name: newVenueName.trim(),
        alias: newVenueAlias.trim(),
        concurrentCapacity: isNaN(capacity) ? 1 : capacity,
      });
      setNewVenueName('');
      setNewVenueAlias('');
      setNewVenueCapacity('1');
      push({
        severity: 'success',
        message: intl.formatMessage(messages.resourceManagementVenueCreated),
      });
      void reload();
    } catch (error) {
      pushError(error);
    }
  }

  async function saveVenue(): Promise<void> {
    if (!api.updateVenue || selectedVenueId === undefined) return;
    const capacity = parseInt(editVenueCapacity, 10);
    const detailsObject: Record<string, string> = {};
    for (const entry of editVenueDetails) {
      if (entry.key.trim() !== '') {
        detailsObject[entry.key.trim()] = entry.value;
      }
    }
    try {
      await api.updateVenue(organizationAlias, selectedVenueId, {
        name: editVenueName.trim(),
        concurrentCapacity: isNaN(capacity) ? 1 : capacity,
        address: editVenueAddress.trim() === '' ? undefined : editVenueAddress.trim(),
        details: Object.keys(detailsObject).length > 0 ? detailsObject : undefined,
      });
      push({
        severity: 'success',
        message: intl.formatMessage(messages.resourceManagementVenueSaved),
      });
      void reload();
    } catch (error) {
      pushError(error);
    }
  }

  async function createOfficial(): Promise<void> {
    if (!api.createOfficial || newOfficialName.trim() === '' || newOfficialRoles.length === 0)
      return;
    try {
      await api.createOfficial(organizationAlias, {
        displayName: newOfficialName.trim(),
        roles: newOfficialRoles,
      });
      setNewOfficialName('');
      setNewOfficialRoles([]);
      push({
        severity: 'success',
        message: intl.formatMessage(messages.resourceManagementOfficialCreated),
      });
      void reload();
    } catch (error) {
      pushError(error);
    }
  }

  async function saveOfficial(): Promise<void> {
    if (!api.updateOfficial || selectedOfficialId === undefined) return;
    try {
      await api.updateOfficial(organizationAlias, selectedOfficialId, {
        displayName: editOfficialName.trim(),
        roles: editOfficialRoles,
      });
      push({
        severity: 'success',
        message: intl.formatMessage(messages.resourceManagementOfficialSaved),
      });
      void reload();
    } catch (error) {
      pushError(error);
    }
  }

  const roleLabel = (role: OfficialRole): string => {
    switch (role) {
      case 'referee':
        return intl.formatMessage(messages.resourceManagementRoleReferee);
      case 'assistant':
        return intl.formatMessage(messages.resourceManagementRoleAssistant);
      case 'table-official':
        return intl.formatMessage(messages.resourceManagementRoleTableOfficial);
      case 'observer':
        return intl.formatMessage(messages.resourceManagementRoleObserver);
    }
  };

  if (loading) {
    return (
      <p className="cl-inline-alert">{intl.formatMessage(messages.resourceManagementLoading)}</p>
    );
  }

  const breadcrumbNode = <span>{organizationAlias}</span>;
  const titleNode = <FormattedMessage {...messages.resourceManagementTitle} />;

  const selectedVenue = venues.find((venue) => venue.venueId === selectedVenueId);
  const selectedOfficial = officials.find((official) => official.officialId === selectedOfficialId);

  const listingNode = (
    <div className="cl-platform-sections">
      <Card
        aria-label={intl.formatMessage(messages.resourceManagementVenuesHeading)}
        className="cl-chamfer cl-chamfer--control"
      >
        <header className="cl-card__header">
          <h2 className="cl-card__title">
            <FormattedMessage {...messages.resourceManagementVenuesHeading} />
          </h2>
        </header>
        <div className="cl-card__content">
          <ul>
            {venues.map((venue) => (
              <li key={venue.venueId} className="cl-role-user">
                <span>{venue.name}</span>
                <Button onClick={() => selectVenue(venue)} type="button" variant="secondary">
                  <FormattedMessage {...messages.resourceManagementEdit} />
                </Button>
              </li>
            ))}
          </ul>
          {venues.length === 0 && (
            <p className="cl-card__description">
              <FormattedMessage {...messages.resourceManagementVenuesEmpty} />
            </p>
          )}

          {api.createVenue && (
            <div className="cl-platform-form-grid">
              <FormField
                id="new-venue-name"
                label={intl.formatMessage(messages.resourceManagementNewVenueName)}
              >
                <Input
                  aria-label={intl.formatMessage(messages.resourceManagementNewVenueName)}
                  id="new-venue-name"
                  onChange={(event) => setNewVenueName(event.target.value)}
                  value={newVenueName}
                />
              </FormField>
              <FormField
                id="new-venue-alias"
                label={intl.formatMessage(messages.resourceManagementNewVenueAlias)}
              >
                <Input
                  aria-label={intl.formatMessage(messages.resourceManagementNewVenueAlias)}
                  id="new-venue-alias"
                  onChange={(event) => setNewVenueAlias(event.target.value)}
                  value={newVenueAlias}
                />
              </FormField>
              <FormField
                id="new-venue-capacity"
                label={intl.formatMessage(messages.resourceManagementNewVenueCapacity)}
              >
                <Input
                  aria-label={intl.formatMessage(messages.resourceManagementNewVenueCapacity)}
                  id="new-venue-capacity"
                  min={1}
                  onChange={(event) => setNewVenueCapacity(event.target.value)}
                  type="number"
                  value={newVenueCapacity}
                />
              </FormField>
              <Button onClick={() => void createVenue()} type="button">
                <FormattedMessage {...messages.resourceManagementAddVenue} />
              </Button>
            </div>
          )}
        </div>
      </Card>

      {selectedVenue && (
        <Card
          aria-label={intl.formatMessage(messages.resourceManagementEditVenueHeading)}
          className="cl-chamfer cl-chamfer--control"
        >
          <header className="cl-card__header">
            <h2 className="cl-card__title">
              <FormattedMessage {...messages.resourceManagementEditVenueHeading} />
            </h2>
          </header>
          <div className="cl-card__content">
            <div className="cl-platform-form-grid">
              <FormField
                id="edit-venue-name"
                label={intl.formatMessage(messages.resourceManagementVenueName)}
              >
                <Input
                  aria-label={intl.formatMessage(messages.resourceManagementVenueName)}
                  id="edit-venue-name"
                  onChange={(event) => setEditVenueName(event.target.value)}
                  value={editVenueName}
                />
              </FormField>
              <FormField
                id="edit-venue-capacity"
                label={intl.formatMessage(messages.resourceManagementVenueCapacity)}
              >
                <Input
                  aria-label={intl.formatMessage(messages.resourceManagementVenueCapacity)}
                  id="edit-venue-capacity"
                  min={1}
                  onChange={(event) => setEditVenueCapacity(event.target.value)}
                  type="number"
                  value={editVenueCapacity}
                />
              </FormField>
              <FormField
                id="edit-venue-address"
                label={intl.formatMessage(messages.resourceManagementVenueAddress)}
              >
                <Input
                  aria-label={intl.formatMessage(messages.resourceManagementVenueAddress)}
                  id="edit-venue-address"
                  onChange={(event) => setEditVenueAddress(event.target.value)}
                  value={editVenueAddress}
                />
              </FormField>
            </div>

            <div className="cl-platform-sections">
              <header className="cl-card__header">
                <h3 className="cl-card__title">
                  <FormattedMessage {...messages.resourceManagementDetailsHeading} />
                </h3>
              </header>
              <p className="cl-card__description">
                <FormattedMessage {...messages.resourceManagementDetailsHint} />
              </p>
              {editVenueDetails.map((row, index) => (
                <div key={index} className="cl-role-user">
                  <Input
                    aria-label={intl.formatMessage(messages.resourceManagementDetailKey)}
                    onChange={(event) =>
                      setEditVenueDetails((current) =>
                        current.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, key: event.target.value } : entry,
                        ),
                      )
                    }
                    placeholder={intl.formatMessage(messages.resourceManagementDetailKey)}
                    value={row.key}
                  />
                  <Input
                    aria-label={intl.formatMessage(messages.resourceManagementDetailValue)}
                    onChange={(event) =>
                      setEditVenueDetails((current) =>
                        current.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, value: event.target.value } : entry,
                        ),
                      )
                    }
                    placeholder={intl.formatMessage(messages.resourceManagementDetailValue)}
                    value={row.value}
                  />
                  <Button
                    onClick={() =>
                      setEditVenueDetails((current) =>
                        current.filter((_entry, entryIndex) => entryIndex !== index),
                      )
                    }
                    type="button"
                    variant="secondary"
                  >
                    <FormattedMessage {...messages.resourceManagementRemoveDetail} />
                  </Button>
                </div>
              ))}
              <Button
                onClick={() =>
                  setEditVenueDetails((current) => [...current, { key: '', value: '' }])
                }
                type="button"
                variant="secondary"
              >
                <FormattedMessage {...messages.resourceManagementAddDetail} />
              </Button>
            </div>

            <Button onClick={() => void saveVenue()} type="button">
              <FormattedMessage {...messages.resourceManagementSaveVenueChanges} />
            </Button>
          </div>
        </Card>
      )}

      <Card
        aria-label={intl.formatMessage(messages.resourceManagementOfficialsHeading)}
        className="cl-chamfer cl-chamfer--control"
      >
        <header className="cl-card__header">
          <h2 className="cl-card__title">
            <FormattedMessage {...messages.resourceManagementOfficialsHeading} />
          </h2>
        </header>
        <div className="cl-card__content">
          <ul>
            {officials.map((official) => (
              <li key={official.officialId} className="cl-role-user">
                <span>
                  {official.displayName} — {official.roles.map(roleLabel).join(', ')}
                </span>
                <Button onClick={() => selectOfficial(official)} type="button" variant="secondary">
                  <FormattedMessage {...messages.resourceManagementEdit} />
                </Button>
              </li>
            ))}
          </ul>
          {officials.length === 0 && (
            <p className="cl-card__description">
              <FormattedMessage {...messages.resourceManagementOfficialsEmpty} />
            </p>
          )}

          {api.createOfficial && (
            <div className="cl-platform-form-grid">
              <FormField
                id="new-official-name"
                label={intl.formatMessage(messages.resourceManagementNewOfficialName)}
              >
                <Input
                  aria-label={intl.formatMessage(messages.resourceManagementNewOfficialName)}
                  id="new-official-name"
                  onChange={(event) => setNewOfficialName(event.target.value)}
                  value={newOfficialName}
                />
              </FormField>
              <fieldset className="cl-role-user">
                <legend className="cl-label">
                  <FormattedMessage {...messages.resourceManagementOfficialRoles} />
                </legend>
                {OFFICIAL_ROLES.map((role) => (
                  <label key={role} className="cl-toggle cl-focusable">
                    <input
                      aria-label={roleLabel(role)}
                      checked={newOfficialRoles.includes(role)}
                      className="cl-checkbox cl-focusable"
                      onChange={() => toggleRole(newOfficialRoles, role, setNewOfficialRoles)}
                      type="checkbox"
                    />
                    <span>{roleLabel(role)}</span>
                  </label>
                ))}
              </fieldset>
              <Button onClick={() => void createOfficial()} type="button">
                <FormattedMessage {...messages.resourceManagementAddOfficial} />
              </Button>
            </div>
          )}
        </div>
      </Card>

      {selectedOfficial && (
        <Card
          aria-label={intl.formatMessage(messages.resourceManagementEditOfficialHeading)}
          className="cl-chamfer cl-chamfer--control"
        >
          <header className="cl-card__header">
            <h2 className="cl-card__title">
              <FormattedMessage {...messages.resourceManagementEditOfficialHeading} />
            </h2>
          </header>
          <div className="cl-card__content">
            <div className="cl-platform-form-grid">
              <FormField
                id="edit-official-name"
                label={intl.formatMessage(messages.resourceManagementOfficialName)}
              >
                <Input
                  aria-label={intl.formatMessage(messages.resourceManagementOfficialName)}
                  id="edit-official-name"
                  onChange={(event) => setEditOfficialName(event.target.value)}
                  value={editOfficialName}
                />
              </FormField>
              <fieldset className="cl-role-user">
                <legend className="cl-label">
                  <FormattedMessage {...messages.resourceManagementOfficialRoles} />
                </legend>
                {OFFICIAL_ROLES.map((role) => (
                  <label key={role} className="cl-toggle cl-focusable">
                    <input
                      aria-label={roleLabel(role)}
                      checked={editOfficialRoles.includes(role)}
                      className="cl-checkbox cl-focusable"
                      onChange={() => toggleRole(editOfficialRoles, role, setEditOfficialRoles)}
                      type="checkbox"
                    />
                    <span>{roleLabel(role)}</span>
                  </label>
                ))}
              </fieldset>
              <Button onClick={() => void saveOfficial()} type="button">
                <FormattedMessage {...messages.resourceManagementSaveOfficialChanges} />
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );

  return <ListScreenTemplate breadcrumb={breadcrumbNode} listing={listingNode} title={titleNode} />;
}
