import { useCallback, useEffect, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  createControlApiClient,
  type ControlApiClient,
  type DrawAssignmentResponse,
  type GroupResponse,
  type RegistrationResponse,
  type ZoneResponse,
} from '../lib/api-client.js';
import { controlLinkClick } from '../lib/control-navigation.js';
import { controlTokenStore } from '../session/token-store.js';
import { Button } from './ui/atoms/button.js';
import { messages } from '../i18n/messages.en.js';
import { useToast } from './ToastProvider.js';

import { ListScreenTemplate } from './ui/templates/list-screen-template.js';

type AssignMode = 'draw' | 'manual';

/** entrantId → 1-based zone/group number, as a text field so an empty box is a legal in-progress state. */
type ManualPlacements = Readonly<Record<string, string>>;

/**
 * Zone/Group management, entrant assignment, and the doorway to a zone's
 * promotion plan — the UI half of zone and group promotion.
 * Client-side manual placements are only sent on "Save assignment"; nothing
 * here writes per-keystroke.
 */
export function ZoneGroupRoute({
  organizationAlias,
  tournamentAlias,
  stageNumber,
  client,
}: {
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
  readonly stageNumber: number;
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

  const [zones, setZones] = useState<readonly ZoneResponse[]>([]);
  const [entrants, setEntrants] = useState<readonly RegistrationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);

  const [newZoneName, setNewZoneName] = useState('');
  const [zoneMode, setZoneMode] = useState<AssignMode>('draw');
  const [zoneCount, setZoneCount] = useState('1');
  const [zoneSeed, setZoneSeed] = useState('1');
  const [zonePlacements, setZonePlacements] = useState<ManualPlacements>({});
  const [zonePreview, setZonePreview] = useState<DrawAssignmentResponse | undefined>(undefined);

  const [selectedZoneNumber, setSelectedZoneNumber] = useState<number | undefined>(undefined);
  const [groups, setGroups] = useState<readonly GroupResponse[]>([]);
  const [zoneEntrantIds, setZoneEntrantIds] = useState<readonly string[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [groupMode, setGroupMode] = useState<AssignMode>('draw');
  const [groupCount, setGroupCount] = useState('1');
  const [groupSeed, setGroupSeed] = useState('1');
  const [groupPlacements, setGroupPlacements] = useState<ManualPlacements>({});
  const [groupPreview, setGroupPreview] = useState<DrawAssignmentResponse | undefined>(undefined);

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const [loadedZones, loadedEntrants] = await Promise.all([
        api.listZones?.(organizationAlias, tournamentAlias, stageNumber) ?? Promise.resolve([]),
        api.listRegistrations(organizationAlias, tournamentAlias, 'accepted'),
      ]);
      setZones(loadedZones);
      setEntrants(loadedEntrants);
      setSelectedZoneNumber((current) => current ?? loadedZones[0]?.number);
      setLoadError(undefined);
    } catch {
      setLoadError(intl.formatMessage(messages.zoneGroupLoadFailed));
    } finally {
      setLoading(false);
    }
  }, [api, organizationAlias, tournamentAlias, stageNumber, intl]);

  useEffect(() => {
    let live = true;
    Promise.all([
      api.listZones?.(organizationAlias, tournamentAlias, stageNumber) ?? Promise.resolve([]),
      api.listRegistrations(organizationAlias, tournamentAlias, 'accepted'),
    ])
      .then(([loadedZones, loadedEntrants]) => {
        if (!live) return;
        setZones(loadedZones);
        setEntrants(loadedEntrants);
        setSelectedZoneNumber((current) => current ?? loadedZones[0]?.number);
        setLoadError(undefined);
      })
      .catch(() => {
        if (live) setLoadError(intl.formatMessage(messages.zoneGroupLoadFailed));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [api, organizationAlias, tournamentAlias, stageNumber, intl]);

  useEffect(() => {
    const load = async (): Promise<void> => {
      if (selectedZoneNumber === undefined) {
        setGroups([]);
        setZoneEntrantIds([]);
        return;
      }
      const [loadedGroups, loadedEntrantIds] = await Promise.all([
        api
          .listGroups?.(organizationAlias, tournamentAlias, stageNumber, selectedZoneNumber)
          .catch(() => []) ?? Promise.resolve([]),
        api
          .fetchZoneEntrants?.(organizationAlias, tournamentAlias, stageNumber, selectedZoneNumber)
          .catch(() => []) ?? Promise.resolve([]),
      ]);
      setGroups(loadedGroups ?? []);
      setZoneEntrantIds(loadedEntrantIds ?? []);
    };
    void load();
  }, [api, organizationAlias, tournamentAlias, stageNumber, selectedZoneNumber]);

  function entrantLabel(entrantId: string): string {
    const entrant = entrants.find((candidate) => candidate.entrantId === entrantId);
    return entrant?.displayName ?? entrantId.slice(-8);
  }

  async function createZone(): Promise<void> {
    if (!api.createZone || newZoneName.trim() === '') return;
    try {
      await api.createZone(organizationAlias, tournamentAlias, stageNumber, {
        name: newZoneName.trim(),
      });
      setNewZoneName('');
      void reload();
    } catch (error) {
      pushError(error);
    }
  }

  async function createGroup(): Promise<void> {
    if (!api.createGroup || selectedZoneNumber === undefined || newGroupName.trim() === '') return;
    try {
      await api.createGroup(organizationAlias, tournamentAlias, stageNumber, selectedZoneNumber, {
        name: newGroupName.trim(),
      });
      setNewGroupName('');
      const loaded = await api.listGroups?.(
        organizationAlias,
        tournamentAlias,
        stageNumber,
        selectedZoneNumber,
      );
      setGroups(loaded ?? []);
    } catch (error) {
      pushError(error);
    }
  }

  async function previewZoneDraw(): Promise<void> {
    if (!api.previewZoneDraw) return;
    try {
      const result = await api.previewZoneDraw(organizationAlias, tournamentAlias, stageNumber, {
        zoneCount: Number(zoneCount),
        seed: Number(zoneSeed),
      });
      setZonePreview(result.assignment);
    } catch (error) {
      pushError(error);
    }
  }

  async function confirmZoneDraw(): Promise<void> {
    if (!api.confirmZoneDraw) return;
    try {
      await api.confirmZoneDraw(organizationAlias, tournamentAlias, stageNumber, {
        zoneCount: Number(zoneCount),
        seed: Number(zoneSeed),
      });
      setZonePreview(undefined);
      push({ severity: 'success', message: intl.formatMessage(messages.zoneGroupAssignmentSaved) });
      void reload();
    } catch (error) {
      pushError(error);
    }
  }

  async function saveZoneManualAssignment(): Promise<void> {
    if (!api.assignZonesManually) return;
    const groupsMap: Record<string, number> = {};
    for (const [entrantId, value] of Object.entries(zonePlacements)) {
      const number = Number(value);
      if (value.trim() !== '' && Number.isInteger(number)) groupsMap[entrantId] = number;
    }
    try {
      await api.assignZonesManually(organizationAlias, tournamentAlias, stageNumber, {
        assignment: { groups: groupsMap },
        zoneCount: Number(zoneCount),
      });
      setZonePlacements({});
      push({ severity: 'success', message: intl.formatMessage(messages.zoneGroupAssignmentSaved) });
      void reload();
    } catch (error) {
      pushError(error);
    }
  }

  async function previewGroupDraw(): Promise<void> {
    if (!api.previewGroupDraw || selectedZoneNumber === undefined) return;
    try {
      const result = await api.previewGroupDraw(
        organizationAlias,
        tournamentAlias,
        stageNumber,
        selectedZoneNumber,
        { groupCount: Number(groupCount), seed: Number(groupSeed) },
      );
      setGroupPreview(result.assignment);
    } catch (error) {
      pushError(error);
    }
  }

  async function confirmGroupDraw(): Promise<void> {
    if (!api.confirmGroupDraw || selectedZoneNumber === undefined) return;
    try {
      await api.confirmGroupDraw(
        organizationAlias,
        tournamentAlias,
        stageNumber,
        selectedZoneNumber,
        {
          groupCount: Number(groupCount),
          seed: Number(groupSeed),
        },
      );
      setGroupPreview(undefined);
      push({ severity: 'success', message: intl.formatMessage(messages.zoneGroupAssignmentSaved) });
      const loaded = await api.listGroups?.(
        organizationAlias,
        tournamentAlias,
        stageNumber,
        selectedZoneNumber,
      );
      setGroups(loaded ?? []);
    } catch (error) {
      pushError(error);
    }
  }

  async function saveGroupManualAssignment(): Promise<void> {
    if (!api.assignGroupsManually || selectedZoneNumber === undefined) return;
    const groupsMap: Record<string, number> = {};
    for (const [entrantId, value] of Object.entries(groupPlacements)) {
      const number = Number(value);
      if (value.trim() !== '' && Number.isInteger(number)) groupsMap[entrantId] = number;
    }
    try {
      await api.assignGroupsManually(
        organizationAlias,
        tournamentAlias,
        stageNumber,
        selectedZoneNumber,
        { assignment: { groups: groupsMap }, groupCount: Number(groupCount) },
      );
      setGroupPlacements({});
      push({ severity: 'success', message: intl.formatMessage(messages.zoneGroupAssignmentSaved) });
      const loaded = await api.listGroups?.(
        organizationAlias,
        tournamentAlias,
        stageNumber,
        selectedZoneNumber,
      );
      setGroups(loaded ?? []);
    } catch (error) {
      pushError(error);
    }
  }

  if (loading) {
    return <p className="cl-inline-alert">{intl.formatMessage(messages.zoneGroupLoading)}</p>;
  }
  if (loadError) {
    return (
      <p className="cl-inline-alert" role="alert">
        {loadError}
      </p>
    );
  }

  const selectedZone = zones.find((zone) => zone.number === selectedZoneNumber);

  const breadcrumbNode = (
    <span>
      {intl.formatMessage(messages.zoneGroupBreadcrumb, { tournamentAlias, stageNumber })}
    </span>
  );

  const titleNode = <FormattedMessage {...messages.zoneGroupTitle} />;

  const listingNode = (
    <div className="cl-platform-sections">
      <section
        aria-label={intl.formatMessage(messages.zoneGroupZonesHeading)}
        className="cl-card cl-chamfer cl-chamfer--control"
      >
        <header className="cl-card__header">
          <h2 className="cl-card__title">
            <FormattedMessage {...messages.zoneGroupZonesHeading} />
          </h2>
        </header>
        <div className="cl-card__content">
          <ul>
            {zones.map((zone) => (
              <li key={zone.number} className="cl-role-user">
                <strong>{zone.number}.</strong> {zone.name}
              </li>
            ))}
          </ul>
          {api.createZone && (
            <div className="cl-platform-form-grid">
              <input
                aria-label={intl.formatMessage(messages.zoneGroupNewZoneName)}
                className="cl-input cl-input--default"
                onChange={(event) => setNewZoneName(event.target.value)}
                placeholder={intl.formatMessage(messages.zoneGroupNewZoneName)}
                value={newZoneName}
              />
              <Button onClick={() => void createZone()} type="button" variant="secondary">
                <FormattedMessage {...messages.zoneGroupAddZone} />
              </Button>
            </div>
          )}
        </div>
      </section>

      <section
        aria-label={intl.formatMessage(messages.zoneGroupAssignZonesHeading)}
        className="cl-card cl-chamfer cl-chamfer--control"
      >
        <header className="cl-card__header">
          <h2 className="cl-card__title">
            <FormattedMessage {...messages.zoneGroupAssignZonesHeading} />
          </h2>
        </header>
        <div className="cl-card__content">
          <div className="cl-role-user">
            <label className="cl-form-field">
              <input
                checked={zoneMode === 'draw'}
                name="zone-assign-mode"
                onChange={() => setZoneMode('draw')}
                type="radio"
              />
              <FormattedMessage {...messages.zoneGroupAutomaticDraw} />
            </label>
            <label className="cl-form-field">
              <input
                checked={zoneMode === 'manual'}
                name="zone-assign-mode"
                onChange={() => setZoneMode('manual')}
                type="radio"
              />
              <FormattedMessage {...messages.zoneGroupManualPlacement} />
            </label>
          </div>

          {zoneMode === 'draw' ? (
            <div className="cl-platform-form-grid">
              <label className="cl-form-field">
                <span className="cl-label">
                  <FormattedMessage {...messages.zoneGroupZoneCount} />
                </span>
                <input
                  aria-label={intl.formatMessage(messages.zoneGroupZoneCount)}
                  className="cl-input cl-input--default"
                  min="1"
                  onChange={(event) => setZoneCount(event.target.value)}
                  type="number"
                  value={zoneCount}
                />
              </label>
              <label className="cl-form-field">
                <span className="cl-label">
                  <FormattedMessage {...messages.zoneGroupSeed} />
                </span>
                <input
                  aria-label={intl.formatMessage(messages.zoneGroupSeed)}
                  className="cl-input cl-input--default"
                  onChange={(event) => setZoneSeed(event.target.value)}
                  type="number"
                  value={zoneSeed}
                />
              </label>
              <Button onClick={() => void previewZoneDraw()} type="button" variant="secondary">
                <FormattedMessage {...messages.zoneGroupPreviewDraw} />
              </Button>
              <Button disabled={!zonePreview} onClick={() => void confirmZoneDraw()} type="button">
                <FormattedMessage {...messages.zoneGroupConfirmDraw} />
              </Button>
            </div>
          ) : (
            <div>
              <ul>
                {entrants.map((entrant) => (
                  <li key={entrant.entrantId} className="cl-role-user">
                    <span>{entrantLabel(entrant.entrantId)}</span>
                    <input
                      aria-label={intl.formatMessage(messages.zoneGroupPlacementNumber, {
                        name: entrantLabel(entrant.entrantId),
                      })}
                      className="cl-input cl-input--default"
                      min="1"
                      onChange={(event) =>
                        setZonePlacements((current) => ({
                          ...current,
                          [entrant.entrantId]: event.target.value,
                        }))
                      }
                      type="number"
                      value={zonePlacements[entrant.entrantId] ?? ''}
                    />
                  </li>
                ))}
              </ul>
              <Button onClick={() => void saveZoneManualAssignment()} type="button">
                <FormattedMessage {...messages.zoneGroupSaveAssignment} />
              </Button>
            </div>
          )}

          {zonePreview && (
            <p className="cl-card__description">
              {intl.formatMessage(messages.zoneGroupPreviewResult, {
                count: Object.keys(zonePreview.groups).length,
              })}
            </p>
          )}
        </div>
      </section>

      {zones.length > 0 && (
        <>
          <label className="cl-form-field">
            <span className="cl-label">
              <FormattedMessage {...messages.zoneGroupSelectZone} />
            </span>
            <select
              aria-label={intl.formatMessage(messages.zoneGroupSelectZone)}
              className="cl-select cl-select--default"
              onChange={(event) => setSelectedZoneNumber(Number(event.target.value))}
              value={selectedZoneNumber ?? ''}
            >
              {zones.map((zone) => (
                <option key={zone.number} value={zone.number}>
                  {zone.name}
                </option>
              ))}
            </select>
          </label>

          <section
            aria-label={intl.formatMessage(messages.zoneGroupGroupsHeading)}
            className="cl-card cl-chamfer cl-chamfer--control"
          >
            <header className="cl-card__header">
              <h2 className="cl-card__title">
                <FormattedMessage {...messages.zoneGroupGroupsHeading} />
              </h2>
            </header>
            <div className="cl-card__content">
              <ul>
                {groups.map((group) => (
                  <li key={group.number} className="cl-role-user">
                    <strong>{group.number}.</strong> {group.name}
                  </li>
                ))}
              </ul>
              {api.createGroup && (
                <div className="cl-platform-form-grid">
                  <input
                    aria-label={intl.formatMessage(messages.zoneGroupNewGroupName)}
                    className="cl-input cl-input--default"
                    onChange={(event) => setNewGroupName(event.target.value)}
                    placeholder={intl.formatMessage(messages.zoneGroupNewGroupName)}
                    value={newGroupName}
                  />
                  <Button onClick={() => void createGroup()} type="button" variant="secondary">
                    <FormattedMessage {...messages.zoneGroupAddGroup} />
                  </Button>
                </div>
              )}
            </div>
          </section>

          <section
            aria-label={intl.formatMessage(messages.zoneGroupAssignGroupsHeading)}
            className="cl-card cl-chamfer cl-chamfer--control"
          >
            <header className="cl-card__header">
              <h2 className="cl-card__title">
                <FormattedMessage {...messages.zoneGroupAssignGroupsHeading} />
              </h2>
            </header>
            <div className="cl-card__content">
              <div className="cl-role-user">
                <label className="cl-form-field">
                  <input
                    checked={groupMode === 'draw'}
                    name="group-assign-mode"
                    onChange={() => setGroupMode('draw')}
                    type="radio"
                  />
                  <FormattedMessage {...messages.zoneGroupAutomaticDraw} />
                </label>
                <label className="cl-form-field">
                  <input
                    checked={groupMode === 'manual'}
                    name="group-assign-mode"
                    onChange={() => setGroupMode('manual')}
                    type="radio"
                  />
                  <FormattedMessage {...messages.zoneGroupManualPlacement} />
                </label>
              </div>

              {groupMode === 'draw' ? (
                <div className="cl-platform-form-grid">
                  <label className="cl-form-field">
                    <span className="cl-label">
                      <FormattedMessage {...messages.zoneGroupGroupCount} />
                    </span>
                    <input
                      aria-label={intl.formatMessage(messages.zoneGroupGroupCount)}
                      className="cl-input cl-input--default"
                      min="1"
                      onChange={(event) => setGroupCount(event.target.value)}
                      type="number"
                      value={groupCount}
                    />
                  </label>
                  <label className="cl-form-field">
                    <span className="cl-label">
                      <FormattedMessage {...messages.zoneGroupSeed} />
                    </span>
                    <input
                      aria-label={intl.formatMessage(messages.zoneGroupSeed)}
                      className="cl-input cl-input--default"
                      onChange={(event) => setGroupSeed(event.target.value)}
                      type="number"
                      value={groupSeed}
                    />
                  </label>
                  <Button onClick={() => void previewGroupDraw()} type="button" variant="secondary">
                    <FormattedMessage {...messages.zoneGroupPreviewDraw} />
                  </Button>
                  <Button
                    disabled={!groupPreview}
                    onClick={() => void confirmGroupDraw()}
                    type="button"
                  >
                    <FormattedMessage {...messages.zoneGroupConfirmDraw} />
                  </Button>
                </div>
              ) : (
                <div>
                  <ul>
                    {zoneEntrantIds.map((entrantId) => (
                      <li key={entrantId} className="cl-role-user">
                        <span>{entrantLabel(entrantId)}</span>
                        <input
                          aria-label={intl.formatMessage(messages.zoneGroupPlacementNumber, {
                            name: entrantLabel(entrantId),
                          })}
                          className="cl-input cl-input--default"
                          min="1"
                          onChange={(event) =>
                            setGroupPlacements((current) => ({
                              ...current,
                              [entrantId]: event.target.value,
                            }))
                          }
                          type="number"
                          value={groupPlacements[entrantId] ?? ''}
                        />
                      </li>
                    ))}
                  </ul>
                  <Button onClick={() => void saveGroupManualAssignment()} type="button">
                    <FormattedMessage {...messages.zoneGroupSaveAssignment} />
                  </Button>
                </div>
              )}

              {groupPreview && (
                <p className="cl-card__description">
                  {intl.formatMessage(messages.zoneGroupPreviewResult, {
                    count: Object.keys(groupPreview.groups).length,
                  })}
                </p>
              )}
            </div>
          </section>

          {selectedZone && (
            <a
              className="cl-focusable"
              href={`/control/${organizationAlias}/tournaments/${tournamentAlias}/stages/${stageNumber}/zones/${selectedZone.number}/promotion`}
              onClick={controlLinkClick(
                `/control/${organizationAlias}/tournaments/${tournamentAlias}/stages/${stageNumber}/zones/${selectedZone.number}/promotion`,
              )}
            >
              <FormattedMessage {...messages.zoneGroupOpenPromotionPlan} />
            </a>
          )}
        </>
      )}
    </div>
  );

  return <ListScreenTemplate breadcrumb={breadcrumbNode} listing={listingNode} title={titleNode} />;
}
