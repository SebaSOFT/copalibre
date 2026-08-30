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
import { Card } from './ui/atoms/card.js';
import { Input } from './ui/atoms/input.js';
import { FormField } from './ui/molecules/form-field.js';
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
  const [zoneNameDrafts, setZoneNameDrafts] = useState<Record<number, string>>({});
  const [zoneMode, setZoneMode] = useState<AssignMode>('draw');
  const [zoneCount, setZoneCount] = useState('1');
  const [zoneSeed, setZoneSeed] = useState('1');
  const [zonePlacements, setZonePlacements] = useState<ManualPlacements>({});
  const [zonePreview, setZonePreview] = useState<DrawAssignmentResponse | undefined>(undefined);

  const [selectedZoneNumber, setSelectedZoneNumber] = useState<number | undefined>(undefined);
  const [groups, setGroups] = useState<readonly GroupResponse[]>([]);
  const [zoneEntrantIds, setZoneEntrantIds] = useState<readonly string[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [groupNameDrafts, setGroupNameDrafts] = useState<Record<number, string>>({});
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

  async function renameZone(zoneNumber: number, name: string): Promise<void> {
    if (!api.renameZone || name.trim() === '') return;
    try {
      await api.renameZone(organizationAlias, tournamentAlias, stageNumber, zoneNumber, {
        name: name.trim(),
      });
      void reload();
    } catch (error) {
      pushError(error);
    }
  }

  async function deleteZone(zoneNumber: number): Promise<void> {
    if (!api.deleteZone) return;
    try {
      await api.deleteZone(organizationAlias, tournamentAlias, stageNumber, zoneNumber);
      void reload();
    } catch (error) {
      pushError(error);
    }
  }

  async function renameGroup(groupNumber: number, name: string): Promise<void> {
    if (!api.renameGroup || selectedZoneNumber === undefined || name.trim() === '') return;
    try {
      await api.renameGroup(
        organizationAlias,
        tournamentAlias,
        stageNumber,
        selectedZoneNumber,
        groupNumber,
        { name: name.trim() },
      );
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

  async function deleteGroup(groupNumber: number): Promise<void> {
    if (!api.deleteGroup || selectedZoneNumber === undefined) return;
    try {
      await api.deleteGroup(
        organizationAlias,
        tournamentAlias,
        stageNumber,
        selectedZoneNumber,
        groupNumber,
      );
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

  const breadcrumbNode = (
    <span>
      {organizationAlias} / {tournamentAlias} / Stage {stageNumber}
    </span>
  );

  const titleNode = <FormattedMessage {...messages.zoneGroupTitle} />;
  const selectedZone = zones.find((z) => z.number === selectedZoneNumber);

  const listingNode = (
    <div className="cl-platform-sections">
      <Card
        aria-label={intl.formatMessage(messages.zoneGroupZonesHeading)}
        className="cl-chamfer cl-chamfer--control"
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
                {api.renameZone && (
                  <>
                    <Input
                      aria-label={intl.formatMessage(messages.zoneGroupRenameZoneLabel, {
                        name: zone.name,
                      })}
                      onChange={(event) =>
                        setZoneNameDrafts((current) => ({
                          ...current,
                          [zone.number]: event.target.value,
                        }))
                      }
                      value={zoneNameDrafts[zone.number] ?? zone.name}
                    />
                    <Button
                      onClick={() =>
                        void renameZone(zone.number, zoneNameDrafts[zone.number] ?? zone.name)
                      }
                      type="button"
                      variant="secondary"
                    >
                      <FormattedMessage {...messages.zoneGroupRename} />
                    </Button>
                  </>
                )}
                {api.deleteZone && (
                  <Button
                    onClick={() => void deleteZone(zone.number)}
                    type="button"
                    variant="destructive-outline"
                  >
                    <FormattedMessage {...messages.zoneGroupDelete} />
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {api.createZone && (
            <div className="cl-platform-form-grid">
              <Input
                aria-label={intl.formatMessage(messages.zoneGroupNewZoneName)}
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
      </Card>

      <Card
        aria-label={intl.formatMessage(messages.zoneGroupAssignZonesHeading)}
        className="cl-chamfer cl-chamfer--control"
      >
        <header className="cl-card__header">
          <h2 className="cl-card__title">
            <FormattedMessage {...messages.zoneGroupAssignZonesHeading} />
          </h2>
        </header>
        <div className="cl-card__content">
          <div className="cl-role-user">
            <label className="cl-toggle cl-focusable">
              <input
                checked={zoneMode === 'draw'}
                name="zone-assign-mode"
                onChange={() => setZoneMode('draw')}
                type="radio"
              />
              <span>
                <FormattedMessage {...messages.zoneGroupAutomaticDraw} />
              </span>
            </label>
            <label className="cl-toggle cl-focusable">
              <input
                checked={zoneMode === 'manual'}
                name="zone-assign-mode"
                onChange={() => setZoneMode('manual')}
                type="radio"
              />
              <span>
                <FormattedMessage {...messages.zoneGroupManualPlacement} />
              </span>
            </label>
          </div>

          {zoneMode === 'draw' ? (
            <div className="cl-platform-form-grid">
              <FormField
                id="zone-draw-count"
                label={intl.formatMessage(messages.zoneGroupZoneCount)}
              >
                <Input
                  aria-label={intl.formatMessage(messages.zoneGroupZoneCount)}
                  id="zone-draw-count"
                  min="1"
                  onChange={(event) => setZoneCount(event.target.value)}
                  type="number"
                  value={zoneCount}
                />
              </FormField>
              <FormField id="zone-draw-seed" label={intl.formatMessage(messages.zoneGroupSeed)}>
                <Input
                  aria-label={intl.formatMessage(messages.zoneGroupSeed)}
                  id="zone-draw-seed"
                  onChange={(event) => setZoneSeed(event.target.value)}
                  type="number"
                  value={zoneSeed}
                />
              </FormField>
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
                    <Input
                      aria-label={intl.formatMessage(messages.zoneGroupPlacementNumber, {
                        name: entrantLabel(entrant.entrantId),
                      })}
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
      </Card>

      {zones.length > 0 && (
        <>
          <FormField id="zone-select" label={intl.formatMessage(messages.zoneGroupSelectZone)}>
            <select
              aria-label={intl.formatMessage(messages.zoneGroupSelectZone)}
              className="cl-select cl-select--default cl-focusable"
              id="zone-select"
              onChange={(event) => setSelectedZoneNumber(Number(event.target.value))}
              value={selectedZoneNumber ?? ''}
            >
              {zones.map((zone) => (
                <option key={zone.number} value={zone.number}>
                  {zone.name}
                </option>
              ))}
            </select>
          </FormField>

          <Card
            aria-label={intl.formatMessage(messages.zoneGroupGroupsHeading)}
            className="cl-chamfer cl-chamfer--control"
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
                    {api.renameGroup && (
                      <>
                        <Input
                          aria-label={intl.formatMessage(messages.zoneGroupRenameGroupLabel, {
                            name: group.name,
                          })}
                          onChange={(event) =>
                            setGroupNameDrafts((current) => ({
                              ...current,
                              [group.number]: event.target.value,
                            }))
                          }
                          value={groupNameDrafts[group.number] ?? group.name}
                        />
                        <Button
                          onClick={() =>
                            void renameGroup(
                              group.number,
                              groupNameDrafts[group.number] ?? group.name,
                            )
                          }
                          type="button"
                          variant="secondary"
                        >
                          <FormattedMessage {...messages.zoneGroupRename} />
                        </Button>
                      </>
                    )}
                    {api.deleteGroup && (
                      <Button
                        onClick={() => void deleteGroup(group.number)}
                        type="button"
                        variant="destructive-outline"
                      >
                        <FormattedMessage {...messages.zoneGroupDelete} />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              {api.createGroup && (
                <div className="cl-platform-form-grid">
                  <Input
                    aria-label={intl.formatMessage(messages.zoneGroupNewGroupName)}
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
          </Card>

          <Card
            aria-label={intl.formatMessage(messages.zoneGroupAssignGroupsHeading)}
            className="cl-chamfer cl-chamfer--control"
          >
            <header className="cl-card__header">
              <h2 className="cl-card__title">
                <FormattedMessage {...messages.zoneGroupAssignGroupsHeading} />
              </h2>
            </header>
            <div className="cl-card__content">
              <div className="cl-role-user">
                <label className="cl-toggle cl-focusable">
                  <input
                    checked={groupMode === 'draw'}
                    name="group-assign-mode"
                    onChange={() => setGroupMode('draw')}
                    type="radio"
                  />
                  <span>
                    <FormattedMessage {...messages.zoneGroupAutomaticDraw} />
                  </span>
                </label>
                <label className="cl-toggle cl-focusable">
                  <input
                    checked={groupMode === 'manual'}
                    name="group-assign-mode"
                    onChange={() => setGroupMode('manual')}
                    type="radio"
                  />
                  <span>
                    <FormattedMessage {...messages.zoneGroupManualPlacement} />
                  </span>
                </label>
              </div>

              {groupMode === 'draw' ? (
                <div className="cl-platform-form-grid">
                  <FormField
                    id="group-draw-count"
                    label={intl.formatMessage(messages.zoneGroupGroupCount)}
                  >
                    <Input
                      aria-label={intl.formatMessage(messages.zoneGroupGroupCount)}
                      id="group-draw-count"
                      min="1"
                      onChange={(event) => setGroupCount(event.target.value)}
                      type="number"
                      value={groupCount}
                    />
                  </FormField>
                  <FormField
                    id="group-draw-seed"
                    label={intl.formatMessage(messages.zoneGroupSeed)}
                  >
                    <Input
                      aria-label={intl.formatMessage(messages.zoneGroupSeed)}
                      id="group-draw-seed"
                      onChange={(event) => setGroupSeed(event.target.value)}
                      type="number"
                      value={groupSeed}
                    />
                  </FormField>
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
                        <Input
                          aria-label={intl.formatMessage(messages.zoneGroupPlacementNumber, {
                            name: entrantLabel(entrantId),
                          })}
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
          </Card>

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
