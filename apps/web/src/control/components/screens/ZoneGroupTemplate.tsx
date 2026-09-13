import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import type {
  ControlApiClient,
  DrawAssignmentResponse,
  GroupResponse,
  RegistrationResponse,
  ZoneResponse,
} from '../../lib/api-client.js';
import { controlLinkClick } from '../../lib/control-navigation.js';
import { Button } from '../ui/atoms/button.js';
import { Card } from '../ui/atoms/card.js';
import { Input } from '../ui/atoms/input.js';
import { RadioGroup, RadioGroupItem } from '../ui/atoms/radio.js';
import { Select } from '../ui/atoms/select.js';
import { Field } from '../ui/molecules/field.js';
import { messages } from '../../i18n/messages.en.js';
import { ListScreenLayout } from '../ui/layouts/list-screen-layout.js';

type AssignMode = 'draw' | 'manual';

/** entrantId → 1-based zone/group number, as a text field so an empty box is a legal in-progress state. */
export type ManualPlacements = Readonly<Record<string, string>>;

/**
 * Composes the screen from data and callbacks `ZoneGroupPage` supplies
 * (openspec 0225 task 6.1): the new-zone/group forms, draw parameters,
 * manual placements, and preview results below are this component's own
 * screen state; every mutation is a call to one of the `on*` props. Which
 * zone is selected lives in the page instead, since selecting one drives a
 * fetch of that zone's groups and entrants.
 */
export function ZoneGroupTemplate({
  api,
  entrantLabel,
  entrants,
  groups,
  onConfirmGroupDraw,
  onConfirmZoneDraw,
  onCreateGroup,
  onCreateZone,
  onDeleteGroup,
  onDeleteZone,
  onPreviewGroupDraw,
  onPreviewZoneDraw,
  onRenameGroup,
  onRenameZone,
  onSaveGroupManualAssignment,
  onSaveZoneManualAssignment,
  onSelectZone,
  organizationAlias,
  selectedZoneNumber,
  stageNumber,
  tournamentAlias,
  zoneEntrantIds,
  zones,
}: {
  readonly api: ControlApiClient;
  readonly entrantLabel: (entrantId: string) => string;
  readonly entrants: readonly RegistrationResponse[];
  readonly groups: readonly GroupResponse[];
  readonly onConfirmGroupDraw: (groupCount: number, seed: number) => Promise<boolean>;
  readonly onConfirmZoneDraw: (zoneCount: number, seed: number) => Promise<boolean>;
  readonly onCreateGroup: (name: string) => Promise<boolean>;
  readonly onCreateZone: (name: string) => Promise<boolean>;
  readonly onDeleteGroup: (groupNumber: number) => Promise<void>;
  readonly onDeleteZone: (zoneNumber: number) => Promise<void>;
  readonly onPreviewGroupDraw: (
    groupCount: number,
    seed: number,
  ) => Promise<DrawAssignmentResponse | undefined>;
  readonly onPreviewZoneDraw: (
    zoneCount: number,
    seed: number,
  ) => Promise<DrawAssignmentResponse | undefined>;
  readonly onRenameGroup: (groupNumber: number, name: string) => Promise<void>;
  readonly onRenameZone: (zoneNumber: number, name: string) => Promise<void>;
  readonly onSaveGroupManualAssignment: (
    placements: ManualPlacements,
    groupCount: number,
  ) => Promise<boolean>;
  readonly onSaveZoneManualAssignment: (
    placements: ManualPlacements,
    zoneCount: number,
  ) => Promise<boolean>;
  readonly onSelectZone: (zoneNumber: number) => void;
  readonly organizationAlias: string;
  readonly selectedZoneNumber: number | undefined;
  readonly stageNumber: number;
  readonly tournamentAlias: string;
  readonly zoneEntrantIds: readonly string[];
  readonly zones: readonly ZoneResponse[];
}): React.JSX.Element {
  const intl = useIntl();

  const [newZoneName, setNewZoneName] = useState('');
  const [zoneNameDrafts, setZoneNameDrafts] = useState<Record<number, string>>({});
  const [zoneMode, setZoneMode] = useState<AssignMode>('draw');
  const [zoneCount, setZoneCount] = useState('1');
  const [zoneSeed, setZoneSeed] = useState('1');
  const [zonePlacements, setZonePlacements] = useState<ManualPlacements>({});
  const [zonePreview, setZonePreview] = useState<DrawAssignmentResponse | undefined>(undefined);

  const [newGroupName, setNewGroupName] = useState('');
  const [groupNameDrafts, setGroupNameDrafts] = useState<Record<number, string>>({});
  const [groupMode, setGroupMode] = useState<AssignMode>('draw');
  const [groupCount, setGroupCount] = useState('1');
  const [groupSeed, setGroupSeed] = useState('1');
  const [groupPlacements, setGroupPlacements] = useState<ManualPlacements>({});
  const [groupPreview, setGroupPreview] = useState<DrawAssignmentResponse | undefined>(undefined);

  async function createZone(): Promise<void> {
    if (await onCreateZone(newZoneName)) setNewZoneName('');
  }

  async function createGroup(): Promise<void> {
    if (await onCreateGroup(newGroupName)) setNewGroupName('');
  }

  async function previewZoneDraw(): Promise<void> {
    const result = await onPreviewZoneDraw(Number(zoneCount), Number(zoneSeed));
    if (result) setZonePreview(result);
  }

  async function confirmZoneDraw(): Promise<void> {
    if (await onConfirmZoneDraw(Number(zoneCount), Number(zoneSeed))) setZonePreview(undefined);
  }

  async function saveZoneManualAssignment(): Promise<void> {
    if (await onSaveZoneManualAssignment(zonePlacements, Number(zoneCount))) setZonePlacements({});
  }

  async function previewGroupDraw(): Promise<void> {
    const result = await onPreviewGroupDraw(Number(groupCount), Number(groupSeed));
    if (result) setGroupPreview(result);
  }

  async function confirmGroupDraw(): Promise<void> {
    if (await onConfirmGroupDraw(Number(groupCount), Number(groupSeed))) setGroupPreview(undefined);
  }

  async function saveGroupManualAssignment(): Promise<void> {
    if (await onSaveGroupManualAssignment(groupPlacements, Number(groupCount)))
      setGroupPlacements({});
  }

  const breadcrumbNode = (
    <span>
      {organizationAlias} / {tournamentAlias} / Stage {stageNumber}
    </span>
  );

  const titleNode = <FormattedMessage {...messages.zoneGroupTitle} />;
  const selectedZone = zones.find((z) => z.number === selectedZoneNumber);

  const listingNode = (
    <div className="cl-screen-sections">
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
                        void onRenameZone(zone.number, zoneNameDrafts[zone.number] ?? zone.name)
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
                    onClick={() => void onDeleteZone(zone.number)}
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
          <RadioGroup
            className="cl-role-user"
            name="zone-assign-mode"
            onValueChange={(val) => setZoneMode(val as AssignMode)}
            value={zoneMode}
          >
            <label className="cl-toggle cl-focusable">
              <RadioGroupItem id="zone-mode-draw" value="draw" />
              <span>
                <FormattedMessage {...messages.zoneGroupAutomaticDraw} />
              </span>
            </label>
            <label className="cl-toggle cl-focusable">
              <RadioGroupItem id="zone-mode-manual" value="manual" />
              <span>
                <FormattedMessage {...messages.zoneGroupManualPlacement} />
              </span>
            </label>
          </RadioGroup>

          {zoneMode === 'draw' ? (
            <div className="cl-platform-form-grid">
              <Field id="zone-draw-count" label={intl.formatMessage(messages.zoneGroupZoneCount)}>
                <Input
                  aria-label={intl.formatMessage(messages.zoneGroupZoneCount)}
                  id="zone-draw-count"
                  min="1"
                  onChange={(event) => setZoneCount(event.target.value)}
                  type="number"
                  value={zoneCount}
                />
              </Field>
              <Field id="zone-draw-seed" label={intl.formatMessage(messages.zoneGroupSeed)}>
                <Input
                  aria-label={intl.formatMessage(messages.zoneGroupSeed)}
                  id="zone-draw-seed"
                  onChange={(event) => setZoneSeed(event.target.value)}
                  type="number"
                  value={zoneSeed}
                />
              </Field>
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
          <Field id="zone-select" label={intl.formatMessage(messages.zoneGroupSelectZone)}>
            <Select
              aria-label={intl.formatMessage(messages.zoneGroupSelectZone)}
              id="zone-select"
              onValueChange={(val) => onSelectZone(Number(val))}
              options={zones.map((zone) => ({
                value: String(zone.number),
                label: zone.name,
              }))}
              value={selectedZoneNumber !== undefined ? String(selectedZoneNumber) : ''}
            />
          </Field>

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
                            void onRenameGroup(
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
                        onClick={() => void onDeleteGroup(group.number)}
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
              <RadioGroup
                className="cl-role-user"
                name="group-assign-mode"
                onValueChange={(val) => setGroupMode(val as AssignMode)}
                value={groupMode}
              >
                <label className="cl-toggle cl-focusable">
                  <RadioGroupItem id="group-mode-draw" value="draw" />
                  <span>
                    <FormattedMessage {...messages.zoneGroupAutomaticDraw} />
                  </span>
                </label>
                <label className="cl-toggle cl-focusable">
                  <RadioGroupItem id="group-mode-manual" value="manual" />
                  <span>
                    <FormattedMessage {...messages.zoneGroupManualPlacement} />
                  </span>
                </label>
              </RadioGroup>

              {groupMode === 'draw' ? (
                <div className="cl-platform-form-grid">
                  <Field
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
                  </Field>
                  <Field id="group-draw-seed" label={intl.formatMessage(messages.zoneGroupSeed)}>
                    <Input
                      aria-label={intl.formatMessage(messages.zoneGroupSeed)}
                      id="group-draw-seed"
                      onChange={(event) => setGroupSeed(event.target.value)}
                      type="number"
                      value={groupSeed}
                    />
                  </Field>
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

  return <ListScreenLayout breadcrumb={breadcrumbNode} listing={listingNode} title={titleNode} />;
}
