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

type AssignMode = 'draw' | 'manual';

/** entrantId → 1-based zone/group number, as a text field so an empty box is a legal in-progress state. */
type ManualPlacements = Readonly<Record<string, string>>;

/**
 * Zone/Group management, entrant assignment, and the doorway to a zone's
 * promotion plan (0108) — the UI half of `0099-zone-group-and-promotion`.
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

  // Mount-time load intentionally does not call `reload` (used only for
  // imperative re-fetches from event handlers, e.g. after a draw or a
  // manual save): `reload`'s own setState calls sit directly in an
  // async/await body, which react-hooks/set-state-in-effect flags when
  // reachable from an effect. Nesting them inside a promise chain instead
  // (as here) keeps them out of that static reachability check — the same
  // pattern already used by RolesPermissionsRoute.tsx. `loading` starts
  // `true` via useState, so there is no need to set it again here.
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

  return (
    <section aria-label={intl.formatMessage(messages.zoneGroupSectionLabel)} style={pageStyle}>
      <header>
        <p style={metaStyle}>
          {intl.formatMessage(messages.zoneGroupBreadcrumb, { tournamentAlias, stageNumber })}
        </p>
        <h1 style={titleStyle}>
          <FormattedMessage {...messages.zoneGroupTitle} />
        </h1>
      </header>

      <section aria-label={intl.formatMessage(messages.zoneGroupZonesHeading)} style={panelStyle}>
        <h2 style={sectionTitleStyle}>
          <FormattedMessage {...messages.zoneGroupZonesHeading} />
        </h2>
        <ul style={listStyle}>
          {zones.map((zone) => (
            <li key={zone.zoneId} style={rowStyle}>
              <strong>{zone.number}.</strong> {zone.name}
            </li>
          ))}
        </ul>
        {api.createZone && (
          <div style={formRowStyle}>
            <input
              aria-label={intl.formatMessage(messages.zoneGroupNewZoneName)}
              onChange={(event) => setNewZoneName(event.target.value)}
              placeholder={intl.formatMessage(messages.zoneGroupNewZoneName)}
              style={inputStyle}
              value={newZoneName}
            />
            <Button onClick={() => void createZone()} type="button" variant="secondary">
              <FormattedMessage {...messages.zoneGroupAddZone} />
            </Button>
          </div>
        )}
      </section>

      <section
        aria-label={intl.formatMessage(messages.zoneGroupAssignZonesHeading)}
        style={panelStyle}
      >
        <h2 style={sectionTitleStyle}>
          <FormattedMessage {...messages.zoneGroupAssignZonesHeading} />
        </h2>
        <div style={modeRowStyle}>
          <label style={radioLabelStyle}>
            <input
              checked={zoneMode === 'draw'}
              name="zone-assign-mode"
              onChange={() => setZoneMode('draw')}
              type="radio"
            />
            <FormattedMessage {...messages.zoneGroupAutomaticDraw} />
          </label>
          <label style={radioLabelStyle}>
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
          <div style={formRowStyle}>
            <label style={labelStyle}>
              <FormattedMessage {...messages.zoneGroupZoneCount} />
              <input
                aria-label={intl.formatMessage(messages.zoneGroupZoneCount)}
                min="1"
                onChange={(event) => setZoneCount(event.target.value)}
                style={inputStyle}
                type="number"
                value={zoneCount}
              />
            </label>
            <label style={labelStyle}>
              <FormattedMessage {...messages.zoneGroupSeed} />
              <input
                aria-label={intl.formatMessage(messages.zoneGroupSeed)}
                onChange={(event) => setZoneSeed(event.target.value)}
                style={inputStyle}
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
            <ul style={listStyle}>
              {entrants.map((entrant) => (
                <li key={entrant.entrantId} style={rowStyle}>
                  <span>{entrantLabel(entrant.entrantId)}</span>
                  <input
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
                    style={numberInputStyle}
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
          <p style={mutedStyle}>
            {intl.formatMessage(messages.zoneGroupPreviewResult, {
              count: Object.keys(zonePreview.groups).length,
            })}
          </p>
        )}
      </section>

      {zones.length > 0 && (
        <>
          <label style={labelStyle}>
            <FormattedMessage {...messages.zoneGroupSelectZone} />
            <select
              aria-label={intl.formatMessage(messages.zoneGroupSelectZone)}
              onChange={(event) => setSelectedZoneNumber(Number(event.target.value))}
              style={inputStyle}
              value={selectedZoneNumber ?? ''}
            >
              {zones.map((zone) => (
                <option key={zone.zoneId} value={zone.number}>
                  {zone.name}
                </option>
              ))}
            </select>
          </label>

          <section
            aria-label={intl.formatMessage(messages.zoneGroupGroupsHeading)}
            style={panelStyle}
          >
            <h2 style={sectionTitleStyle}>
              <FormattedMessage {...messages.zoneGroupGroupsHeading} />
            </h2>
            <ul style={listStyle}>
              {groups.map((group) => (
                <li key={group.groupId} style={rowStyle}>
                  <strong>{group.number}.</strong> {group.name}
                </li>
              ))}
            </ul>
            {api.createGroup && (
              <div style={formRowStyle}>
                <input
                  aria-label={intl.formatMessage(messages.zoneGroupNewGroupName)}
                  onChange={(event) => setNewGroupName(event.target.value)}
                  placeholder={intl.formatMessage(messages.zoneGroupNewGroupName)}
                  style={inputStyle}
                  value={newGroupName}
                />
                <Button onClick={() => void createGroup()} type="button" variant="secondary">
                  <FormattedMessage {...messages.zoneGroupAddGroup} />
                </Button>
              </div>
            )}
          </section>

          <section
            aria-label={intl.formatMessage(messages.zoneGroupAssignGroupsHeading)}
            style={panelStyle}
          >
            <h2 style={sectionTitleStyle}>
              <FormattedMessage {...messages.zoneGroupAssignGroupsHeading} />
            </h2>
            <div style={modeRowStyle}>
              <label style={radioLabelStyle}>
                <input
                  checked={groupMode === 'draw'}
                  name="group-assign-mode"
                  onChange={() => setGroupMode('draw')}
                  type="radio"
                />
                <FormattedMessage {...messages.zoneGroupAutomaticDraw} />
              </label>
              <label style={radioLabelStyle}>
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
              <div style={formRowStyle}>
                <label style={labelStyle}>
                  <FormattedMessage {...messages.zoneGroupGroupCount} />
                  <input
                    aria-label={intl.formatMessage(messages.zoneGroupGroupCount)}
                    min="1"
                    onChange={(event) => setGroupCount(event.target.value)}
                    style={inputStyle}
                    type="number"
                    value={groupCount}
                  />
                </label>
                <label style={labelStyle}>
                  <FormattedMessage {...messages.zoneGroupSeed} />
                  <input
                    aria-label={intl.formatMessage(messages.zoneGroupSeed)}
                    onChange={(event) => setGroupSeed(event.target.value)}
                    style={inputStyle}
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
                <ul style={listStyle}>
                  {zoneEntrantIds.map((entrantId) => (
                    <li key={entrantId} style={rowStyle}>
                      <span>{entrantLabel(entrantId)}</span>
                      <input
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
                        style={numberInputStyle}
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
              <p style={mutedStyle}>
                {intl.formatMessage(messages.zoneGroupPreviewResult, {
                  count: Object.keys(groupPreview.groups).length,
                })}
              </p>
            )}
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
    </section>
  );
}

const pageStyle: React.CSSProperties = { display: 'grid', gap: 'var(--cl-space-5)' };
const metaStyle: React.CSSProperties = {
  color: 'var(--cl-text-muted)',
  fontFamily: 'var(--cl-font-mono)',
  margin: 0,
};
const titleStyle: React.CSSProperties = {
  margin: 'var(--cl-space-1) 0 0',
  fontFamily: 'var(--cl-font-display)',
};
const panelStyle: React.CSSProperties = {
  border: '1px solid var(--cl-border-muted)',
  padding: 'var(--cl-space-4)',
  background: 'var(--cl-surface-panel)',
  display: 'grid',
  gap: 'var(--cl-space-3)',
};
const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--cl-font-display)',
};
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
  justifyContent: 'space-between',
  gap: 'var(--cl-space-3)',
};
const formRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'end',
  gap: 'var(--cl-space-3)',
  flexWrap: 'wrap',
};
const modeRowStyle: React.CSSProperties = { display: 'flex', gap: 'var(--cl-space-4)' };
const radioLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--cl-space-1)',
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
const numberInputStyle: React.CSSProperties = { width: '5rem' };
const mutedStyle: React.CSSProperties = {
  color: 'var(--cl-text-muted)',
  fontSize: 'var(--cl-font-size-sm)',
};
