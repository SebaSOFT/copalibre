import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import type {
  ControlApiClient,
  OfficialResponse,
  OfficialRole,
  ScheduleDetailResponse,
  VenueResponse,
} from '../../lib/api-client.js';
import { Button } from '../ui/atoms/button.js';
import { Card } from '../ui/atoms/card.js';
import { Checkbox } from '../ui/atoms/checkbox.js';
import { Input } from '../ui/atoms/input.js';
import { Field } from '../ui/molecules/field.js';
import { messages } from '../../i18n/messages.en.js';
import { ListScreenLayout } from '../ui/layouts/list-screen-layout.js';

const OFFICIAL_ROLES: readonly OfficialRole[] = [
  'referee',
  'assistant',
  'table-official',
  'observer',
];

/**
 * Composes the screen from data and callbacks `VenueManagementPage`
 * supplies (openspec 0225 task 6.1): the new-record forms, the selected
 * record being edited, and the venue/role checkbox toggles below are this
 * component's own screen state; every mutation is a call to one of the
 * `on*` props.
 */
export function VenueManagementTemplate({
  api,
  officials,
  onCreateOfficial,
  onCreateSchedule,
  onCreateVenue,
  onDeleteSchedule,
  onSaveOfficial,
  onSaveSchedule,
  onSaveVenue,
  organizationAlias,
  schedules,
  venues,
}: {
  readonly api: ControlApiClient;
  readonly officials: readonly OfficialResponse[];
  readonly onCreateOfficial: (name: string, roles: readonly OfficialRole[]) => Promise<boolean>;
  readonly onCreateSchedule: (
    name: string,
    startsAt: string,
    endsAt: string,
    slotMinutes: string,
    turnaroundMinutes: string,
    venueIds: readonly string[],
  ) => Promise<boolean>;
  readonly onCreateVenue: (name: string, alias: string, capacity: string) => Promise<boolean>;
  readonly onDeleteSchedule: (scheduleId: string) => Promise<boolean>;
  readonly onSaveOfficial: (
    officialId: string,
    name: string,
    roles: readonly OfficialRole[],
  ) => Promise<void>;
  readonly onSaveSchedule: (scheduleId: string, name: string) => Promise<void>;
  readonly onSaveVenue: (
    venueId: string,
    name: string,
    capacity: string,
    address: string,
    details: readonly { readonly key: string; readonly value: string }[],
  ) => Promise<void>;
  readonly organizationAlias: string;
  readonly schedules: readonly ScheduleDetailResponse[];
  readonly venues: readonly VenueResponse[];
}): React.JSX.Element {
  const intl = useIntl();

  const [newVenueName, setNewVenueName] = useState('');
  const [newVenueAlias, setNewVenueAlias] = useState('');
  const [newVenueCapacity, setNewVenueCapacity] = useState('1');

  const [newOfficialName, setNewOfficialName] = useState('');
  const [newOfficialRoles, setNewOfficialRoles] = useState<readonly OfficialRole[]>([]);

  const [newScheduleName, setNewScheduleName] = useState('');
  const [newScheduleStartsAt, setNewScheduleStartsAt] = useState('');
  const [newScheduleEndsAt, setNewScheduleEndsAt] = useState('');
  const [newScheduleSlotMinutes, setNewScheduleSlotMinutes] = useState('60');
  const [newScheduleTurnaroundMinutes, setNewScheduleTurnaroundMinutes] = useState('15');
  const [newScheduleVenueIds, setNewScheduleVenueIds] = useState<readonly string[]>([]);

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

  const [selectedScheduleId, setSelectedScheduleId] = useState<string>();
  const [editScheduleName, setEditScheduleName] = useState('');

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

  const selectSchedule = (schedule: ScheduleDetailResponse): void => {
    setSelectedScheduleId(schedule.scheduleId);
    setEditScheduleName(schedule.name);
  };

  const toggleRole = (
    current: readonly OfficialRole[],
    role: OfficialRole,
    set: (next: readonly OfficialRole[]) => void,
  ): void => {
    set(current.includes(role) ? current.filter((r) => r !== role) : [...current, role]);
  };

  const toggleScheduleVenue = (venueId: string): void => {
    setNewScheduleVenueIds((current) =>
      current.includes(venueId) ? current.filter((id) => id !== venueId) : [...current, venueId],
    );
  };

  async function createVenue(): Promise<void> {
    if (await onCreateVenue(newVenueName, newVenueAlias, newVenueCapacity)) {
      setNewVenueName('');
      setNewVenueAlias('');
      setNewVenueCapacity('1');
    }
  }

  async function saveVenue(): Promise<void> {
    if (selectedVenueId === undefined) return;
    await onSaveVenue(
      selectedVenueId,
      editVenueName,
      editVenueCapacity,
      editVenueAddress,
      editVenueDetails,
    );
  }

  async function createOfficial(): Promise<void> {
    if (await onCreateOfficial(newOfficialName, newOfficialRoles)) {
      setNewOfficialName('');
      setNewOfficialRoles([]);
    }
  }

  async function saveOfficial(): Promise<void> {
    if (selectedOfficialId === undefined) return;
    await onSaveOfficial(selectedOfficialId, editOfficialName, editOfficialRoles);
  }

  async function createSchedule(): Promise<void> {
    const succeeded = await onCreateSchedule(
      newScheduleName,
      newScheduleStartsAt,
      newScheduleEndsAt,
      newScheduleSlotMinutes,
      newScheduleTurnaroundMinutes,
      newScheduleVenueIds,
    );
    if (succeeded) {
      setNewScheduleName('');
      setNewScheduleStartsAt('');
      setNewScheduleEndsAt('');
      setNewScheduleVenueIds([]);
    }
  }

  async function saveSchedule(): Promise<void> {
    if (selectedScheduleId === undefined) return;
    await onSaveSchedule(selectedScheduleId, editScheduleName);
  }

  async function deleteSchedule(scheduleId: string): Promise<void> {
    if (await onDeleteSchedule(scheduleId)) {
      if (selectedScheduleId === scheduleId) setSelectedScheduleId(undefined);
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

  const breadcrumbNode = <span>{organizationAlias}</span>;
  const titleNode = <FormattedMessage {...messages.resourceManagementTitle} />;

  const selectedVenue = venues.find((venue) => venue.venueId === selectedVenueId);
  const selectedOfficial = officials.find((official) => official.officialId === selectedOfficialId);
  const selectedSchedule = schedules.find((s) => s.scheduleId === selectedScheduleId);

  const listingNode = (
    <div className="cl-screen-sections">
      {/* Venues */}
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
              <Field
                id="new-venue-name"
                label={intl.formatMessage(messages.resourceManagementNewVenueName)}
              >
                <Input
                  aria-label={intl.formatMessage(messages.resourceManagementNewVenueName)}
                  id="new-venue-name"
                  onChange={(event) => setNewVenueName(event.target.value)}
                  value={newVenueName}
                />
              </Field>
              <Field
                id="new-venue-alias"
                label={intl.formatMessage(messages.resourceManagementNewVenueAlias)}
              >
                <Input
                  aria-label={intl.formatMessage(messages.resourceManagementNewVenueAlias)}
                  id="new-venue-alias"
                  onChange={(event) => setNewVenueAlias(event.target.value)}
                  value={newVenueAlias}
                />
              </Field>
              <Field
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
              </Field>
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
              <Field
                id="edit-venue-name"
                label={intl.formatMessage(messages.resourceManagementVenueName)}
              >
                <Input
                  aria-label={intl.formatMessage(messages.resourceManagementVenueName)}
                  id="edit-venue-name"
                  onChange={(event) => setEditVenueName(event.target.value)}
                  value={editVenueName}
                />
              </Field>
              <Field
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
              </Field>
              <Field
                id="edit-venue-address"
                label={intl.formatMessage(messages.resourceManagementVenueAddress)}
              >
                <Input
                  aria-label={intl.formatMessage(messages.resourceManagementVenueAddress)}
                  id="edit-venue-address"
                  onChange={(event) => setEditVenueAddress(event.target.value)}
                  value={editVenueAddress}
                />
              </Field>

              <fieldset className="cl-role-user">
                <legend className="cl-label">
                  <FormattedMessage {...messages.resourceManagementDetailsHeading} />
                </legend>
                <p className="cl-card__description">
                  <FormattedMessage {...messages.resourceManagementDetailsHint} />
                </p>
                {editVenueDetails.map((detail, index) => (
                  <div key={index} className="cl-platform-form-grid">
                    <Input
                      aria-label={intl.formatMessage(messages.resourceManagementDetailKey)}
                      onChange={(event) => {
                        const next = [...editVenueDetails];
                        next[index] = { ...next[index], key: event.target.value };
                        setEditVenueDetails(next);
                      }}
                      placeholder={intl.formatMessage(messages.resourceManagementDetailKey)}
                      value={detail.key}
                    />
                    <Input
                      aria-label={intl.formatMessage(messages.resourceManagementDetailValue)}
                      onChange={(event) => {
                        const next = [...editVenueDetails];
                        next[index] = { ...next[index], value: event.target.value };
                        setEditVenueDetails(next);
                      }}
                      placeholder={intl.formatMessage(messages.resourceManagementDetailValue)}
                      value={detail.value}
                    />
                    <Button
                      onClick={() =>
                        setEditVenueDetails(editVenueDetails.filter((_, i) => i !== index))
                      }
                      type="button"
                      variant="secondary"
                    >
                      <FormattedMessage {...messages.resourceManagementRemoveDetail} />
                    </Button>
                  </div>
                ))}
                <Button
                  onClick={() => setEditVenueDetails([...editVenueDetails, { key: '', value: '' }])}
                  type="button"
                  variant="secondary"
                >
                  <FormattedMessage {...messages.resourceManagementAddDetail} />
                </Button>
              </fieldset>

              <Button onClick={() => void saveVenue()} type="button">
                <FormattedMessage {...messages.resourceManagementSaveVenueChanges} />
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Schedules */}
      <Card
        aria-label={intl.formatMessage(messages.resourceManagementSchedulesHeading)}
        className="cl-chamfer cl-chamfer--control"
      >
        <header className="cl-card__header">
          <h2 className="cl-card__title">
            <FormattedMessage {...messages.resourceManagementSchedulesHeading} />
          </h2>
        </header>
        <div className="cl-card__content">
          <ul>
            {schedules.map((schedule) => (
              <li key={schedule.scheduleId} className="cl-role-user">
                <span>
                  <strong>{schedule.name}</strong> —{' '}
                  <FormattedMessage
                    {...messages.resourceManagementScheduleSlotsCount}
                    values={{ count: schedule.slots.length }}
                  />
                </span>
                <div>
                  <Button
                    onClick={() => selectSchedule(schedule)}
                    type="button"
                    variant="secondary"
                  >
                    <FormattedMessage {...messages.resourceManagementEdit} />
                  </Button>
                  <Button
                    onClick={() => void deleteSchedule(schedule.scheduleId)}
                    type="button"
                    variant="secondary"
                  >
                    <FormattedMessage {...messages.resourceManagementDeleteSchedule} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {schedules.length === 0 && (
            <p className="cl-card__description">
              <FormattedMessage {...messages.resourceManagementSchedulesEmpty} />
            </p>
          )}

          {api.createSchedule && (
            <div className="cl-platform-form-grid">
              <Field
                id="new-schedule-name"
                label={intl.formatMessage(messages.resourceManagementNewScheduleName)}
              >
                <Input
                  aria-label={intl.formatMessage(messages.resourceManagementNewScheduleName)}
                  id="new-schedule-name"
                  onChange={(event) => setNewScheduleName(event.target.value)}
                  value={newScheduleName}
                />
              </Field>
              <Field
                id="new-schedule-starts-at"
                label={intl.formatMessage(messages.resourceManagementNewScheduleStartsAt)}
              >
                <Input
                  aria-label={intl.formatMessage(messages.resourceManagementNewScheduleStartsAt)}
                  id="new-schedule-starts-at"
                  onChange={(event) => setNewScheduleStartsAt(event.target.value)}
                  type="datetime-local"
                  value={newScheduleStartsAt}
                />
              </Field>
              <Field
                id="new-schedule-ends-at"
                label={intl.formatMessage(messages.resourceManagementNewScheduleEndsAt)}
              >
                <Input
                  aria-label={intl.formatMessage(messages.resourceManagementNewScheduleEndsAt)}
                  id="new-schedule-ends-at"
                  onChange={(event) => setNewScheduleEndsAt(event.target.value)}
                  type="datetime-local"
                  value={newScheduleEndsAt}
                />
              </Field>
              <Field
                id="new-schedule-slot-minutes"
                label={intl.formatMessage(messages.resourceManagementNewScheduleSlotMinutes)}
              >
                <Input
                  aria-label={intl.formatMessage(messages.resourceManagementNewScheduleSlotMinutes)}
                  id="new-schedule-slot-minutes"
                  min={1}
                  onChange={(event) => setNewScheduleSlotMinutes(event.target.value)}
                  type="number"
                  value={newScheduleSlotMinutes}
                />
              </Field>
              <Field
                id="new-schedule-turnaround-minutes"
                label={intl.formatMessage(messages.resourceManagementNewScheduleTurnaroundMinutes)}
              >
                <Input
                  aria-label={intl.formatMessage(
                    messages.resourceManagementNewScheduleTurnaroundMinutes,
                  )}
                  id="new-schedule-turnaround-minutes"
                  min={0}
                  onChange={(event) => setNewScheduleTurnaroundMinutes(event.target.value)}
                  type="number"
                  value={newScheduleTurnaroundMinutes}
                />
              </Field>
              <fieldset className="cl-role-user">
                <legend className="cl-label">
                  <FormattedMessage {...messages.resourceManagementNewScheduleVenues} />
                </legend>
                {venues.map((venue) => (
                  <label key={venue.venueId} className="cl-toggle cl-focusable">
                    <Checkbox
                      aria-label={venue.name}
                      checked={newScheduleVenueIds.includes(venue.venueId)}
                      onCheckedChange={() => toggleScheduleVenue(venue.venueId)}
                    />
                    <span>{venue.name}</span>
                  </label>
                ))}
              </fieldset>
              <Button onClick={() => void createSchedule()} type="button">
                <FormattedMessage {...messages.resourceManagementAddSchedule} />
              </Button>
            </div>
          )}
        </div>
      </Card>

      {selectedSchedule && (
        <Card
          aria-label={intl.formatMessage(messages.resourceManagementEditScheduleHeading)}
          className="cl-chamfer cl-chamfer--control"
        >
          <header className="cl-card__header">
            <h2 className="cl-card__title">
              <FormattedMessage {...messages.resourceManagementEditScheduleHeading} />
            </h2>
          </header>
          <div className="cl-card__content">
            <div className="cl-platform-form-grid">
              <Field
                id="edit-schedule-name"
                label={intl.formatMessage(messages.resourceManagementNewScheduleName)}
              >
                <Input
                  aria-label={intl.formatMessage(messages.resourceManagementNewScheduleName)}
                  id="edit-schedule-name"
                  onChange={(event) => setEditScheduleName(event.target.value)}
                  value={editScheduleName}
                />
              </Field>
              <Button onClick={() => void saveSchedule()} type="button">
                <FormattedMessage {...messages.resourceManagementSaveScheduleChanges} />
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Officials */}
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
                  {official.displayName}
                  {official.roles.length > 0 && ` — ${official.roles.map(roleLabel).join(', ')}`}
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
              <Field
                id="new-official-name"
                label={intl.formatMessage(messages.resourceManagementNewOfficialName)}
              >
                <Input
                  aria-label={intl.formatMessage(messages.resourceManagementNewOfficialName)}
                  id="new-official-name"
                  onChange={(event) => setNewOfficialName(event.target.value)}
                  value={newOfficialName}
                />
              </Field>
              <fieldset className="cl-role-user">
                <legend className="cl-label">
                  <FormattedMessage {...messages.resourceManagementOfficialRoles} />
                </legend>
                {OFFICIAL_ROLES.map((role) => (
                  <label key={role} className="cl-toggle cl-focusable">
                    <Checkbox
                      aria-label={roleLabel(role)}
                      checked={newOfficialRoles.includes(role)}
                      onCheckedChange={() =>
                        toggleRole(newOfficialRoles, role, setNewOfficialRoles)
                      }
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
              <Field
                id="edit-official-name"
                label={intl.formatMessage(messages.resourceManagementOfficialName)}
              >
                <Input
                  aria-label={intl.formatMessage(messages.resourceManagementOfficialName)}
                  id="edit-official-name"
                  onChange={(event) => setEditOfficialName(event.target.value)}
                  value={editOfficialName}
                />
              </Field>
              <fieldset className="cl-role-user">
                <legend className="cl-label">
                  <FormattedMessage {...messages.resourceManagementOfficialRoles} />
                </legend>
                {OFFICIAL_ROLES.map((role) => (
                  <label key={role} className="cl-toggle cl-focusable">
                    <Checkbox
                      aria-label={roleLabel(role)}
                      checked={editOfficialRoles.includes(role)}
                      onCheckedChange={() =>
                        toggleRole(editOfficialRoles, role, setEditOfficialRoles)
                      }
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

  return <ListScreenLayout breadcrumb={breadcrumbNode} listing={listingNode} title={titleNode} />;
}
