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
import { messages } from '../i18n/messages.en.js';
import { useToast } from './ToastProvider.js';

const OFFICIAL_ROLES: readonly OfficialRole[] = [
  'referee',
  'assistant',
  'table-official',
  'observer',
];

/**
 * Venue and official management (0124) — the resource pool a schedule
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
  const [loadError, setLoadError] = useState<string | undefined>(undefined);

  const [newVenueName, setNewVenueName] = useState('');
  const [newVenueAlias, setNewVenueAlias] = useState('');
  const [newVenueCapacity, setNewVenueCapacity] = useState('1');

  const [selectedVenueId, setSelectedVenueId] = useState<string | undefined>(undefined);
  const [editVenueName, setEditVenueName] = useState('');
  const [editVenueCapacity, setEditVenueCapacity] = useState('1');
  const [editVenueAddress, setEditVenueAddress] = useState('');
  const [editVenueDetails, setEditVenueDetails] = useState<
    readonly { readonly key: string; readonly value: string }[]
  >([]);

  const [newOfficialName, setNewOfficialName] = useState('');
  const [newOfficialRoles, setNewOfficialRoles] = useState<readonly OfficialRole[]>([]);

  const [selectedOfficialId, setSelectedOfficialId] = useState<string | undefined>(undefined);
  const [editOfficialName, setEditOfficialName] = useState('');
  const [editOfficialRoles, setEditOfficialRoles] = useState<readonly OfficialRole[]>([]);

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const [loadedVenues, loadedOfficials] = await Promise.all([
        api.listVenues?.(organizationAlias) ?? Promise.resolve([]),
        api.listOfficials?.(organizationAlias) ?? Promise.resolve([]),
      ]);
      setVenues(loadedVenues);
      setOfficials(loadedOfficials);
      setLoadError(undefined);
    } catch {
      setLoadError(intl.formatMessage(messages.resourceManagementLoadFailed));
    } finally {
      setLoading(false);
    }
  }, [api, organizationAlias, intl]);

  // Mount-time load, nested in a promise chain rather than a bare async
  // call: keeps this effect out of react-hooks/set-state-in-effect's static
  // reachability check, the same pattern `ClubManagementRoute` (0109) and
  // `PreferencesRoute` (0121) already use.
  useEffect(() => {
    void Promise.resolve().then(() => reload());
  }, [reload]);

  function selectVenue(venue: VenueResponse): void {
    setSelectedVenueId(venue.venueId);
    setEditVenueName(venue.name);
    setEditVenueCapacity(String(venue.concurrentCapacity));
    setEditVenueAddress(venue.address ?? '');
    setEditVenueDetails(
      Object.entries(venue.details ?? {}).map(([key, value]) => ({ key, value })),
    );
  }

  function selectOfficial(official: OfficialResponse): void {
    setSelectedOfficialId(official.officialId);
    setEditOfficialName(official.displayName);
    setEditOfficialRoles(official.roles);
  }

  function detailsFrom(
    rows: readonly { readonly key: string; readonly value: string }[],
  ): Record<string, string> | undefined {
    const entries = rows.filter((row) => row.key.trim() !== '');
    if (entries.length === 0) return undefined;
    return Object.fromEntries(entries.map((row) => [row.key.trim(), row.value]));
  }

  async function createVenue(): Promise<void> {
    if (!api.createVenue || newVenueName.trim() === '' || newVenueAlias.trim() === '') return;
    const capacity = Number(newVenueCapacity);
    try {
      await api.createVenue(organizationAlias, {
        alias: newVenueAlias.trim(),
        name: newVenueName.trim(),
        concurrentCapacity: Number.isFinite(capacity) ? capacity : 1,
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
    const capacity = Number(editVenueCapacity);
    try {
      const updated = await api.updateVenue(organizationAlias, selectedVenueId, {
        name: editVenueName.trim(),
        concurrentCapacity: Number.isFinite(capacity) ? capacity : 1,
        ...(editVenueAddress.trim() === '' ? {} : { address: editVenueAddress.trim() }),
        details: detailsFrom(editVenueDetails),
      });
      push({
        severity: 'success',
        message: intl.formatMessage(messages.resourceManagementVenueSaved),
      });
      setVenues((current) =>
        current.map((venue) => (venue.venueId === updated.venueId ? updated : venue)),
      );
    } catch (error) {
      pushError(error);
    }
  }

  async function createOfficial(): Promise<void> {
    if (!api.createOfficial || newOfficialName.trim() === '' || newOfficialRoles.length === 0) {
      return;
    }
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
      const updated = await api.updateOfficial(organizationAlias, selectedOfficialId, {
        displayName: editOfficialName.trim(),
        roles: editOfficialRoles,
      });
      push({
        severity: 'success',
        message: intl.formatMessage(messages.resourceManagementOfficialSaved),
      });
      setOfficials((current) =>
        current.map((official) =>
          official.officialId === updated.officialId ? updated : official,
        ),
      );
    } catch (error) {
      pushError(error);
    }
  }

  function roleLabel(role: OfficialRole): string {
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
  }

  function toggleRole(
    roles: readonly OfficialRole[],
    role: OfficialRole,
    setRoles: (roles: readonly OfficialRole[]) => void,
  ): void {
    setRoles(
      roles.includes(role) ? roles.filter((candidate) => candidate !== role) : [...roles, role],
    );
  }

  const selectedVenue = venues.find((venue) => venue.venueId === selectedVenueId);
  const selectedOfficial = officials.find((official) => official.officialId === selectedOfficialId);

  if (loading) {
    return (
      <p className="cl-inline-alert">{intl.formatMessage(messages.resourceManagementLoading)}</p>
    );
  }
  if (loadError) {
    return (
      <p className="cl-inline-alert" role="alert">
        {loadError}
      </p>
    );
  }

  return (
    <section
      aria-label={intl.formatMessage(messages.resourceManagementSectionLabel)}
      style={pageStyle}
    >
      <header>
        <h1 style={titleStyle}>
          <FormattedMessage {...messages.resourceManagementTitle} />
        </h1>
      </header>

      <section
        aria-label={intl.formatMessage(messages.resourceManagementVenuesHeading)}
        style={panelStyle}
      >
        <h2 style={sectionTitleStyle}>
          <FormattedMessage {...messages.resourceManagementVenuesHeading} />
        </h2>
        <ul style={listStyle}>
          {venues.map((venue) => (
            <li key={venue.venueId} style={rowStyle}>
              <span>{venue.name}</span>
              <Button onClick={() => selectVenue(venue)} type="button" variant="secondary">
                <FormattedMessage {...messages.resourceManagementEdit} />
              </Button>
            </li>
          ))}
        </ul>
        {venues.length === 0 && (
          <p style={mutedStyle}>
            <FormattedMessage {...messages.resourceManagementVenuesEmpty} />
          </p>
        )}

        {api.createVenue && (
          <div style={formRowStyle}>
            <label style={labelStyle}>
              <FormattedMessage {...messages.resourceManagementNewVenueName} />
              <input
                aria-label={intl.formatMessage(messages.resourceManagementNewVenueName)}
                onChange={(event) => setNewVenueName(event.target.value)}
                style={inputStyle}
                value={newVenueName}
              />
            </label>
            <label style={labelStyle}>
              <FormattedMessage {...messages.resourceManagementNewVenueAlias} />
              <input
                aria-label={intl.formatMessage(messages.resourceManagementNewVenueAlias)}
                onChange={(event) => setNewVenueAlias(event.target.value)}
                style={inputStyle}
                value={newVenueAlias}
              />
            </label>
            <label style={labelStyle}>
              <FormattedMessage {...messages.resourceManagementNewVenueCapacity} />
              <input
                aria-label={intl.formatMessage(messages.resourceManagementNewVenueCapacity)}
                min={1}
                onChange={(event) => setNewVenueCapacity(event.target.value)}
                style={inputStyle}
                type="number"
                value={newVenueCapacity}
              />
            </label>
            <Button onClick={() => void createVenue()} type="button">
              <FormattedMessage {...messages.resourceManagementAddVenue} />
            </Button>
          </div>
        )}
      </section>

      {selectedVenue && (
        <section
          aria-label={intl.formatMessage(messages.resourceManagementEditVenueHeading)}
          style={panelStyle}
        >
          <h2 style={sectionTitleStyle}>
            <FormattedMessage {...messages.resourceManagementEditVenueHeading} />
          </h2>
          <div style={formRowStyle}>
            <label style={labelStyle}>
              <FormattedMessage {...messages.resourceManagementVenueName} />
              <input
                aria-label={intl.formatMessage(messages.resourceManagementVenueName)}
                onChange={(event) => setEditVenueName(event.target.value)}
                style={inputStyle}
                value={editVenueName}
              />
            </label>
            <label style={labelStyle}>
              <FormattedMessage {...messages.resourceManagementVenueCapacity} />
              <input
                aria-label={intl.formatMessage(messages.resourceManagementVenueCapacity)}
                min={1}
                onChange={(event) => setEditVenueCapacity(event.target.value)}
                style={inputStyle}
                type="number"
                value={editVenueCapacity}
              />
            </label>
            <label style={labelStyle}>
              <FormattedMessage {...messages.resourceManagementVenueAddress} />
              <input
                aria-label={intl.formatMessage(messages.resourceManagementVenueAddress)}
                onChange={(event) => setEditVenueAddress(event.target.value)}
                style={inputStyle}
                value={editVenueAddress}
              />
            </label>
          </div>

          <div>
            <h3 style={sectionTitleStyle}>
              <FormattedMessage {...messages.resourceManagementDetailsHeading} />
            </h3>
            <p style={mutedStyle}>
              <FormattedMessage {...messages.resourceManagementDetailsHint} />
            </p>
            {editVenueDetails.map((row, index) => (
              <div key={index} style={formRowStyle}>
                <input
                  aria-label={intl.formatMessage(messages.resourceManagementDetailKey)}
                  onChange={(event) =>
                    setEditVenueDetails((current) =>
                      current.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, key: event.target.value } : entry,
                      ),
                    )
                  }
                  placeholder={intl.formatMessage(messages.resourceManagementDetailKey)}
                  style={inputStyle}
                  value={row.key}
                />
                <input
                  aria-label={intl.formatMessage(messages.resourceManagementDetailValue)}
                  onChange={(event) =>
                    setEditVenueDetails((current) =>
                      current.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, value: event.target.value } : entry,
                      ),
                    )
                  }
                  placeholder={intl.formatMessage(messages.resourceManagementDetailValue)}
                  style={inputStyle}
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
              onClick={() => setEditVenueDetails((current) => [...current, { key: '', value: '' }])}
              type="button"
              variant="secondary"
            >
              <FormattedMessage {...messages.resourceManagementAddDetail} />
            </Button>
          </div>

          <Button onClick={() => void saveVenue()} type="button">
            <FormattedMessage {...messages.resourceManagementSaveVenueChanges} />
          </Button>
        </section>
      )}

      <section
        aria-label={intl.formatMessage(messages.resourceManagementOfficialsHeading)}
        style={panelStyle}
      >
        <h2 style={sectionTitleStyle}>
          <FormattedMessage {...messages.resourceManagementOfficialsHeading} />
        </h2>
        <ul style={listStyle}>
          {officials.map((official) => (
            <li key={official.officialId} style={rowStyle}>
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
          <p style={mutedStyle}>
            <FormattedMessage {...messages.resourceManagementOfficialsEmpty} />
          </p>
        )}

        {api.createOfficial && (
          <div style={formRowStyle}>
            <label style={labelStyle}>
              <FormattedMessage {...messages.resourceManagementNewOfficialName} />
              <input
                aria-label={intl.formatMessage(messages.resourceManagementNewOfficialName)}
                onChange={(event) => setNewOfficialName(event.target.value)}
                style={inputStyle}
                value={newOfficialName}
              />
            </label>
            <fieldset style={fieldsetStyle}>
              <legend>
                <FormattedMessage {...messages.resourceManagementOfficialRoles} />
              </legend>
              {OFFICIAL_ROLES.map((role) => (
                <label key={role} style={checkboxLabelStyle}>
                  <input
                    checked={newOfficialRoles.includes(role)}
                    onChange={() => toggleRole(newOfficialRoles, role, setNewOfficialRoles)}
                    type="checkbox"
                  />
                  {roleLabel(role)}
                </label>
              ))}
            </fieldset>
            <Button onClick={() => void createOfficial()} type="button">
              <FormattedMessage {...messages.resourceManagementAddOfficial} />
            </Button>
          </div>
        )}
      </section>

      {selectedOfficial && (
        <section
          aria-label={intl.formatMessage(messages.resourceManagementEditOfficialHeading)}
          style={panelStyle}
        >
          <h2 style={sectionTitleStyle}>
            <FormattedMessage {...messages.resourceManagementEditOfficialHeading} />
          </h2>
          <div style={formRowStyle}>
            <label style={labelStyle}>
              <FormattedMessage {...messages.resourceManagementOfficialName} />
              <input
                aria-label={intl.formatMessage(messages.resourceManagementOfficialName)}
                onChange={(event) => setEditOfficialName(event.target.value)}
                style={inputStyle}
                value={editOfficialName}
              />
            </label>
            <fieldset style={fieldsetStyle}>
              <legend>
                <FormattedMessage {...messages.resourceManagementOfficialRoles} />
              </legend>
              {OFFICIAL_ROLES.map((role) => (
                <label key={role} style={checkboxLabelStyle}>
                  <input
                    checked={editOfficialRoles.includes(role)}
                    onChange={() => toggleRole(editOfficialRoles, role, setEditOfficialRoles)}
                    type="checkbox"
                  />
                  {roleLabel(role)}
                </label>
              ))}
            </fieldset>
            <Button onClick={() => void saveOfficial()} type="button">
              <FormattedMessage {...messages.resourceManagementSaveOfficialChanges} />
            </Button>
          </div>
        </section>
      )}
    </section>
  );
}

const pageStyle: React.CSSProperties = { display: 'grid', gap: 'var(--cl-space-5)' };
const titleStyle: React.CSSProperties = { margin: 0, fontFamily: 'var(--cl-font-display)' };
const panelStyle: React.CSSProperties = {
  border: '1px solid var(--cl-border-muted)',
  padding: 'var(--cl-space-4)',
  background: 'var(--cl-surface-panel)',
  display: 'grid',
  gap: 'var(--cl-space-3)',
};
const sectionTitleStyle: React.CSSProperties = { margin: 0, fontFamily: 'var(--cl-font-display)' };
const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  gap: 'var(--cl-space-2)',
};
const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--cl-space-3)',
  justifyContent: 'space-between',
};
const formRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'end',
  gap: 'var(--cl-space-3)',
  flexWrap: 'wrap',
};
const labelStyle: React.CSSProperties = {
  display: 'grid',
  gap: 'var(--cl-space-1)',
  color: 'var(--cl-text-secondary)',
};
const inputStyle: React.CSSProperties = {
  minWidth: 0,
  padding: 'var(--cl-space-2)',
  border: '1px solid var(--cl-border-muted)',
  background: 'var(--cl-surface-base)',
  color: 'inherit',
};
const mutedStyle: React.CSSProperties = {
  color: 'var(--cl-text-muted)',
  fontSize: 'var(--cl-font-size-sm)',
};
const fieldsetStyle: React.CSSProperties = {
  border: '1px solid var(--cl-border-muted)',
  padding: 'var(--cl-space-2)',
  display: 'flex',
  gap: 'var(--cl-space-3)',
  flexWrap: 'wrap',
};
const checkboxLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--cl-space-1)',
};
