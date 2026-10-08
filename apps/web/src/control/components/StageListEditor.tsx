import { useEffect, useMemo, useRef, useState } from 'react';
import { FormattedMessage, useIntl, type IntlShape } from 'react-intl';
import { messages } from '../i18n/messages.en.js';
import type {
  AllocationMode,
  SeedDirection,
  SeriesResolutionClass,
  StageSeriesDraft,
  WizardStageDraft,
  WizardZoneDraft,
} from '../lib/stage-authoring.js';
import {
  addZone,
  appendStage,
  removeStage,
  removeZone,
  replaceStage,
  replaceZone,
} from '../lib/stage-authoring.js';
import { SERIES_CLASS_LABELS, STAGE_FORMAT_LABELS } from '../lib/stage-format-labels.js';
import {
  derivePreviewEntrantCount,
  derivePreviewPlaceholders,
  generatePreviewMatches,
  generatePreviewNames,
  groupSlotCounts,
  isIllustrativePreview,
} from '../lib/wizard-preview.js';
import { BracketCanvas } from './BracketCanvas.js';
import { Button } from './ui/atoms/button.js';
import { Card, CardContent } from './ui/atoms/card.js';
import { Checkbox } from './ui/atoms/checkbox.js';
import { DecisionHint } from './ui/atoms/decision-hint.js';
import { Input } from './ui/atoms/input.js';
import { Grid } from './ui/atoms/layout/grid.js';
import { Inline } from './ui/atoms/layout/inline.js';
import { Stack } from './ui/atoms/layout/stack.js';
import { Label } from './ui/atoms/label.js';
import { Select } from './ui/atoms/select.js';
import { Field } from './ui/molecules/field.js';
import {
  ALLOCATION_MODES,
  SERIES_RESOLUTION_CLASSES,
  emptySeriesDraft,
} from '../lib/stage-authoring.js';

const ALLOCATION_MODE_LABELS: Record<
  AllocationMode,
  typeof messages.stageEditorAllocationAutomatic
> = {
  automatic: messages.stageEditorAllocationAutomatic,
  manual: messages.stageEditorAllocationManual,
  weighted: messages.stageEditorAllocationWeighted,
};

const ALLOCATION_DIRECTION_LABELS: Record<
  SeedDirection,
  typeof messages.stageEditorAllocationDirectionHigherFirst
> = {
  'higher-first': messages.stageEditorAllocationDirectionHigherFirst,
  'lower-first': messages.stageEditorAllocationDirectionLowerFirst,
};

const GROUP_DISTRIBUTION_LABELS: Readonly<
  Record<
    NonNullable<WizardStageDraft['groupConfiguration']>['distribution'],
    typeof messages.stageEditorGroupBalanced
  >
> = {
  balanced: messages.stageEditorGroupBalanced,
  'exact-size': messages.stageEditorGroupExactSize,
  'overflow-last': messages.stageEditorGroupOverflowLast,
  manual: messages.stageEditorGroupManual,
};

/**
 * The stage list both `TournamentSetupWizard` and `ProfileBuilderWizard` author
 * — one shared component so their stage editors never drift (design.md's
 * "Profile-picked stages render read-only in `TournamentSetupWizard`" reuses
 * the same rendering path via `readOnly`, never a separate preview component).
 *
 * Data the component itself has no way to know — which formats a discipline
 * supports, whether series/allocation controls apply, where an attribute-key
 * list comes from — is always a prop, never reached into: `ProfileBuilderWizard`
 * authors a discipline-neutral document with no tournament context to reach for.
 */
export function StageListEditor({
  stages,
  formats,
  onChange,
  showSeries = false,
  showZones = false,
  showAllocation = false,
  attributeKeys = [],
  readOnly = false,
  formatHintText,
  showStructurePreview = false,
  capacity,
}: {
  readonly stages: readonly WizardStageDraft[];
  readonly formats: readonly string[];
  readonly onChange?: (stages: readonly WizardStageDraft[]) => void;
  /** `TournamentSetupWizard` declares per-stage series; `ProfileBuilderWizard` does not. */
  readonly showSeries?: boolean;
  /** `TournamentSetupWizard` declares each stage's zones; `ProfileBuilderWizard` does not. */
  readonly showZones?: boolean;
  readonly showAllocation?: boolean;
  readonly attributeKeys?: readonly string[];
  readonly readOnly?: boolean;
  /** The discipline's own format decision hint (description, reversibility) — same for every stage. */
  readonly formatHintText?: string;
  /** Previews the first stage's bracket structure (openspec 0242). */
  readonly showStructurePreview?: boolean;
  /** Registration capacity used to determine preview entrant count. */
  readonly capacity?: number;
}): React.JSX.Element {
  const intl = useIntl();

  function patchStage(number: number, patch: Partial<WizardStageDraft>): void {
    onChange?.(replaceStage(stages, number, patch));
  }

  return (
    <Stack
      aria-label={intl.formatMessage(messages.stageEditorTitle)}
      data-readonly={readOnly ? 'true' : undefined}
      gap="4"
    >
      {/*
        A stage is genuinely an ordered list, and the layout primitives only
        ever render a <div> — Stack cannot become an <ol> the way it becomes
        everything else here. Recorded in KNOWN_INLINE_LAYOUT rather than
        forced through a primitive that would drop the list semantics.
      */}
      <ol
        style={{
          display: 'grid',
          gap: 'var(--cl-space-4)',
          listStyle: 'none',
          padding: 0,
          margin: 0,
        }}
      >
        {stages.map((stage) => (
          <li key={stage.number}>
            <Card>
              <CardContent>
                <Stack gap="3">
                  <Inline align="center" justify="between" gap="3">
                    <strong>
                      <FormattedMessage
                        {...messages.stageEditorStageHeading}
                        values={{ number: stage.number }}
                      />
                    </strong>
                    {!readOnly && stages.length > 1 && (
                      <Button
                        onClick={() => onChange?.(removeStage(stages, stage.number))}
                        type="button"
                        variant="secondary"
                      >
                        <FormattedMessage {...messages.stageEditorRemoveStage} />
                      </Button>
                    )}
                  </Inline>

                  <div className="cl-platform-form-grid">
                    <Field
                      id={`stage-${stage.number}-name`}
                      label={intl.formatMessage(messages.stageEditorStageName)}
                    >
                      <Input
                        disabled={readOnly}
                        id={`stage-${stage.number}-name`}
                        onChange={(event) => patchStage(stage.number, { name: event.target.value })}
                        value={stage.name}
                      />
                    </Field>
                    <Field
                      id={`stage-${stage.number}-format`}
                      label={intl.formatMessage(messages.stageEditorStageFormat)}
                    >
                      <Select
                        aria-describedby={
                          formatHintText === undefined
                            ? undefined
                            : `stage-${stage.number}-format-hint`
                        }
                        aria-label={intl.formatMessage(messages.stageEditorStageFormat)}
                        disabled={readOnly}
                        id={`stage-${stage.number}-format`}
                        onValueChange={(val) => patchStage(stage.number, { format: val })}
                        options={formats.map((format) => {
                          const label = STAGE_FORMAT_LABELS[format];
                          return {
                            value: format,
                            label: label === undefined ? format : intl.formatMessage(label),
                          };
                        })}
                        value={stage.format}
                      />
                      {formatHintText !== undefined && (
                        <DecisionHint
                          id={`stage-${stage.number}-format-hint`}
                          text={formatHintText}
                        />
                      )}
                    </Field>
                  </div>

                  {showSeries && (
                    <SeriesFields
                      idPrefix={`stage-${stage.number}`}
                      intl={intl}
                      onChange={(series) => patchStage(stage.number, { series })}
                      readOnly={readOnly}
                      series={stage.series}
                      toggleLabel={messages.stageEditorSeriesToggle}
                    />
                  )}

                  {showAllocation && (
                    <AllocationFields
                      attributeKeys={attributeKeys}
                      intl={intl}
                      onChange={(allocation) => patchStage(stage.number, { allocation })}
                      readOnly={readOnly}
                      stage={stage}
                    />
                  )}

                  <GroupConfigurationFields
                    intl={intl}
                    onChange={(groupConfiguration) =>
                      patchStage(stage.number, { groupConfiguration })
                    }
                    readOnly={readOnly}
                    stage={stage}
                  />

                  {showZones && (
                    <ZoneFields
                      formats={formats}
                      intl={intl}
                      onChange={(zones) => patchStage(stage.number, { zones })}
                      readOnly={readOnly}
                      showSeries={showSeries}
                      stage={stage}
                    />
                  )}

                  {showStructurePreview && stage.number === 1 && (
                    <StageStructurePreview
                      capacity={capacity}
                      format={stage.format}
                      groupConfiguration={stage.groupConfiguration}
                    />
                  )}
                </Stack>
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>

      {!readOnly && (
        <Button
          onClick={() => onChange?.(appendStage(stages, formats[0]))}
          type="button"
          variant="secondary"
        >
          <FormattedMessage {...messages.stageEditorAddStage} />
        </Button>
      )}
    </Stack>
  );
}

function GroupConfigurationFields({
  stage,
  intl,
  onChange,
  readOnly,
}: {
  readonly stage: WizardStageDraft;
  readonly intl: IntlShape;
  readonly onChange: (configuration: WizardStageDraft['groupConfiguration']) => void;
  readonly readOnly: boolean;
}): React.JSX.Element {
  const configuration = stage.groupConfiguration;
  return (
    <Stack gap="2">
      <Label className="cl-toggle cl-focusable">
        <Checkbox
          checked={configuration !== undefined}
          disabled={readOnly}
          onCheckedChange={(checked) =>
            onChange(
              checked
                ? {
                    groupCount: 2,
                    groupSize: 4,
                    distribution: 'balanced',
                  }
                : undefined,
            )
          }
        />
        <span>{intl.formatMessage(messages.stageEditorConfigureGroups)}</span>
      </Label>
      {configuration !== undefined && (
        <div className="cl-platform-form-grid">
          <Field
            id={`stage-${stage.number}-group-count`}
            label={intl.formatMessage(messages.stageEditorGroupCount)}
          >
            <Input
              disabled={readOnly}
              id={`stage-${stage.number}-group-count`}
              min={2}
              onChange={(event) => {
                const groupCount = Number(event.target.value);
                onChange({
                  ...configuration,
                  groupCount,
                  ...(configuration.distribution === 'manual'
                    ? {
                        manualGroupSizes: Array.from(
                          { length: Math.max(0, groupCount) },
                          (_, index) =>
                            configuration.manualGroupSizes?.[index] ?? configuration.groupSize,
                        ),
                      }
                    : {}),
                });
              }}
              type="number"
              value={configuration.groupCount}
            />
          </Field>
          <Field
            id={`stage-${stage.number}-group-size`}
            label={intl.formatMessage(messages.stageEditorGroupSize)}
          >
            <Input
              disabled={readOnly}
              id={`stage-${stage.number}-group-size`}
              min={2}
              onChange={(event) =>
                onChange({ ...configuration, groupSize: Number(event.target.value) })
              }
              type="number"
              value={configuration.groupSize}
            />
          </Field>
          <Field
            id={`stage-${stage.number}-group-distribution`}
            label={intl.formatMessage(messages.stageEditorGroupDistribution)}
          >
            <Select
              disabled={readOnly}
              id={`stage-${stage.number}-group-distribution`}
              onValueChange={(value) => {
                const distribution = value as typeof configuration.distribution;
                onChange(
                  distribution === 'manual'
                    ? {
                        ...configuration,
                        distribution,
                        manualGroupSizes: Array.from(
                          { length: configuration.groupCount },
                          (_, index) =>
                            configuration.manualGroupSizes?.[index] ?? configuration.groupSize,
                        ),
                      }
                    : {
                        groupCount: configuration.groupCount,
                        groupSize: configuration.groupSize,
                        distribution,
                      },
                );
              }}
              options={Object.entries(GROUP_DISTRIBUTION_LABELS).map(([value, label]) => ({
                value,
                label: intl.formatMessage(label),
              }))}
              value={configuration.distribution}
            />
          </Field>
          {configuration.distribution === 'manual' &&
            configuration.manualGroupSizes?.map((size, index) => (
              <Field
                id={`stage-${stage.number}-group-${index + 1}-size`}
                key={index}
                label={intl.formatMessage(messages.stageEditorManualGroupSize, {
                  number: index + 1,
                })}
              >
                <Input
                  disabled={readOnly}
                  id={`stage-${stage.number}-group-${index + 1}-size`}
                  min={1}
                  onChange={(event) =>
                    onChange({
                      ...configuration,
                      manualGroupSizes: configuration.manualGroupSizes?.map(
                        (current, currentIndex) =>
                          currentIndex === index ? Number(event.target.value) : current,
                      ),
                    })
                  }
                  type="number"
                  value={size}
                />
              </Field>
            ))}
        </div>
      )}
    </Stack>
  );
}

function SeriesFields({
  idPrefix,
  series,
  toggleLabel,
  intl,
  onChange,
  readOnly,
}: {
  readonly idPrefix: string;
  readonly series: StageSeriesDraft | undefined;
  readonly toggleLabel: typeof messages.stageEditorSeriesToggle;
  readonly intl: IntlShape;
  readonly onChange: (series: StageSeriesDraft | undefined) => void;
  readonly readOnly: boolean;
}): React.JSX.Element {
  const enabled = series !== undefined;
  // Toggling off declares no series, but the operator's own values survive
  // the round trip — re-enabling restores them rather than a blank draft,
  // the same way span and resolution class always have.
  const lastSeries = useRef<StageSeriesDraft | undefined>(series);
  useEffect(() => {
    if (series !== undefined) lastSeries.current = series;
  }, [series]);

  return (
    <Stack gap="3">
      <Inline align="center" className="cl-toggle cl-focusable" gap="2">
        <Checkbox
          aria-label={intl.formatMessage(toggleLabel)}
          checked={enabled}
          disabled={readOnly}
          id={`${idPrefix}-series-enable`}
          onCheckedChange={(checked) =>
            onChange(checked ? (lastSeries.current ?? emptySeriesDraft()) : undefined)
          }
        />
        <span>
          <FormattedMessage {...toggleLabel} />
        </span>
      </Inline>

      {series && (
        <SeriesValueFields
          idPrefix={idPrefix}
          intl={intl}
          onChange={onChange}
          readOnly={readOnly}
          series={series}
        />
      )}
    </Stack>
  );
}

function SeriesValueFields({
  series,
  idPrefix,
  intl,
  onChange,
  readOnly,
}: {
  readonly series: StageSeriesDraft;
  readonly idPrefix: string;
  readonly intl: IntlShape;
  readonly onChange: (series: StageSeriesDraft | undefined) => void;
  readonly readOnly: boolean;
}): React.JSX.Element {
  return (
    <Stack gap="3">
      <Grid columns={2} gap="3">
        <Field
          id={`${idPrefix}-series-span`}
          label={intl.formatMessage(messages.stageEditorSeriesSpan)}
        >
          <Input
            disabled={readOnly}
            id={`${idPrefix}-series-span`}
            inputMode="numeric"
            min={2}
            onChange={(event) =>
              onChange({
                ...series,
                span:
                  event.target.value === '' ? undefined : Number.parseInt(event.target.value, 10),
              })
            }
            type="number"
            value={series.span ?? ''}
          />
        </Field>
        <Field
          id={`${idPrefix}-series-class`}
          label={intl.formatMessage(messages.stageEditorSeriesResolutionClass)}
        >
          <Select
            aria-label={intl.formatMessage(messages.stageEditorSeriesResolutionClass)}
            disabled={readOnly}
            id={`${idPrefix}-series-class`}
            onValueChange={(val) =>
              onChange({ ...series, resolutionClass: val as SeriesResolutionClass })
            }
            options={SERIES_RESOLUTION_CLASSES.map((resolutionClass) => ({
              value: resolutionClass,
              label: intl.formatMessage(SERIES_CLASS_LABELS[resolutionClass]),
            }))}
            value={series.resolutionClass ?? ''}
          />
        </Field>
      </Grid>
      <Inline align="center" className="cl-toggle cl-focusable" gap="2">
        <Checkbox
          aria-label={intl.formatMessage(messages.stageEditorSeriesNeutralGround)}
          checked={series.neutralGround}
          disabled={readOnly}
          id={`${idPrefix}-series-neutral`}
          onCheckedChange={(checked) => onChange({ ...series, neutralGround: checked })}
        />
        <span>
          <FormattedMessage {...messages.stageEditorSeriesNeutralGround} />
        </span>
      </Inline>
      <Inline align="center" className="cl-toggle cl-focusable" gap="2">
        <Checkbox
          aria-label={intl.formatMessage(messages.stageEditorSeriesAccountPerSeries)}
          checked={series.standingsAccounting === 'series'}
          disabled={readOnly}
          id={`${idPrefix}-series-per-series`}
          onCheckedChange={(checked) =>
            onChange({ ...series, standingsAccounting: checked ? 'series' : 'match' })
          }
        />
        <span>
          <FormattedMessage {...messages.stageEditorSeriesAccountPerSeries} />
        </span>
      </Inline>
    </Stack>
  );
}

const INHERIT_ZONE_FORMAT = '__inherit__';

/**
 * The stage's zones, behind a disclosure so a stage that declares none reads as it always has. A zone
 * inherits its stage's format and series unless it declares its own; entrants are assigned to zones
 * after registration, so this only declares structure.
 */
function ZoneFields({
  stage,
  formats,
  intl,
  onChange,
  readOnly,
  showSeries,
}: {
  readonly stage: WizardStageDraft;
  readonly formats: readonly string[];
  readonly intl: IntlShape;
  readonly onChange: (zones: readonly WizardZoneDraft[]) => void;
  readonly readOnly: boolean;
  readonly showSeries: boolean;
}): React.JSX.Element {
  const zones = stage.zones ?? [];
  const stageFormatLabel = STAGE_FORMAT_LABELS[stage.format];
  const stageFormat =
    stageFormatLabel === undefined ? stage.format : intl.formatMessage(stageFormatLabel);

  return (
    <details>
      <summary>
        <FormattedMessage {...messages.stageEditorZonesSummary} values={{ count: zones.length }} />
      </summary>
      <Stack gap="3">
        <p style={{ margin: 0, color: 'var(--cl-text-secondary)' }}>
          <FormattedMessage {...messages.stageEditorZonesHint} />
        </p>
        {zones.map((zone, index) => {
          const idPrefix = `stage-${stage.number}-zone-${index + 1}`;
          return (
            <Card key={idPrefix}>
              <CardContent>
                <Stack gap="3">
                  <Inline align="center" justify="between" gap="3">
                    <strong>
                      <FormattedMessage
                        {...messages.stageEditorZoneHeading}
                        values={{ number: index + 1 }}
                      />
                    </strong>
                    {!readOnly && (
                      <Button
                        onClick={() => onChange(removeZone(stage, index))}
                        type="button"
                        variant="secondary"
                      >
                        <FormattedMessage {...messages.stageEditorRemoveZone} />
                      </Button>
                    )}
                  </Inline>
                  <div className="cl-platform-form-grid">
                    <Field
                      id={`${idPrefix}-name`}
                      label={intl.formatMessage(messages.stageEditorZoneName)}
                    >
                      <Input
                        disabled={readOnly}
                        id={`${idPrefix}-name`}
                        onChange={(event) =>
                          onChange(replaceZone(stage, index, { name: event.target.value }))
                        }
                        value={zone.name}
                      />
                    </Field>
                    <Field
                      id={`${idPrefix}-format`}
                      label={intl.formatMessage(messages.stageEditorZoneFormat)}
                    >
                      <Select
                        aria-label={intl.formatMessage(messages.stageEditorZoneFormat)}
                        disabled={readOnly}
                        id={`${idPrefix}-format`}
                        onValueChange={(val) =>
                          onChange(
                            replaceZone(stage, index, {
                              format: val === INHERIT_ZONE_FORMAT ? undefined : val,
                            }),
                          )
                        }
                        options={[
                          {
                            value: INHERIT_ZONE_FORMAT,
                            label: intl.formatMessage(messages.stageEditorZoneFormatInherit, {
                              format: stageFormat,
                            }),
                          },
                          ...formats.map((format) => {
                            const label = STAGE_FORMAT_LABELS[format];
                            return {
                              value: format,
                              label: label === undefined ? format : intl.formatMessage(label),
                            };
                          }),
                        ]}
                        value={zone.format ?? INHERIT_ZONE_FORMAT}
                      />
                    </Field>
                  </div>
                  {showSeries && (
                    <SeriesFields
                      idPrefix={idPrefix}
                      intl={intl}
                      onChange={(series) => onChange(replaceZone(stage, index, { series }))}
                      readOnly={readOnly}
                      series={zone.series}
                      toggleLabel={messages.stageEditorZoneSeriesToggle}
                    />
                  )}
                </Stack>
              </CardContent>
            </Card>
          );
        })}
        {!readOnly && (
          <Button onClick={() => onChange(addZone(stage))} type="button" variant="secondary">
            <FormattedMessage {...messages.stageEditorAddZone} />
          </Button>
        )}
      </Stack>
    </details>
  );
}

function AllocationFields({
  stage,
  intl,
  onChange,
  readOnly,
  attributeKeys,
}: {
  readonly stage: WizardStageDraft;
  readonly intl: IntlShape;
  readonly onChange: (allocation: WizardStageDraft['allocation']) => void;
  readonly readOnly: boolean;
  readonly attributeKeys: readonly string[];
}): React.JSX.Element {
  const mode = stage.allocation?.mode;
  return (
    <div className="cl-platform-form-grid">
      <Field
        id={`stage-${stage.number}-allocation-mode`}
        label={intl.formatMessage(messages.stageEditorAllocationLabel)}
      >
        <Select
          aria-label={intl.formatMessage(messages.stageEditorAllocationLabel)}
          disabled={readOnly}
          id={`stage-${stage.number}-allocation-mode`}
          onValueChange={(val) =>
            onChange(
              val === ''
                ? undefined
                : {
                    mode: val as AllocationMode,
                    ...(val === 'weighted' ? { direction: 'higher-first' as const } : {}),
                  },
            )
          }
          options={[
            { value: '', label: intl.formatMessage(messages.stageEditorAllocationNone) },
            ...ALLOCATION_MODES.map((allocationMode) => ({
              value: allocationMode,
              label: intl.formatMessage(ALLOCATION_MODE_LABELS[allocationMode]),
            })),
          ]}
          value={mode ?? ''}
        />
      </Field>

      {mode === 'weighted' && stage.allocation && (
        <WeightedAllocationFields
          allocation={stage.allocation}
          attributeKeys={attributeKeys}
          intl={intl}
          onChange={onChange}
          readOnly={readOnly}
          stageNumber={stage.number}
        />
      )}
    </div>
  );
}

function WeightedAllocationFields({
  allocation,
  stageNumber,
  intl,
  onChange,
  readOnly,
  attributeKeys,
}: {
  readonly allocation: NonNullable<WizardStageDraft['allocation']>;
  readonly stageNumber: number;
  readonly intl: IntlShape;
  readonly onChange: (allocation: WizardStageDraft['allocation']) => void;
  readonly readOnly: boolean;
  readonly attributeKeys: readonly string[];
}): React.JSX.Element {
  return (
    <>
      <Field
        id={`stage-${stageNumber}-allocation-attribute`}
        label={intl.formatMessage(messages.stageEditorAllocationAttributeKey)}
      >
        {attributeKeys.length > 0 ? (
          <Select
            aria-label={intl.formatMessage(messages.stageEditorAllocationAttributeKey)}
            disabled={readOnly}
            id={`stage-${stageNumber}-allocation-attribute`}
            onValueChange={(val) => onChange({ ...allocation, attributeKey: val })}
            options={attributeKeys.map((key) => ({ value: key, label: key }))}
            value={allocation.attributeKey ?? ''}
          />
        ) : (
          <Input
            disabled={readOnly}
            id={`stage-${stageNumber}-allocation-attribute`}
            onChange={(event) => onChange({ ...allocation, attributeKey: event.target.value })}
            value={allocation.attributeKey ?? ''}
          />
        )}
      </Field>
      <Field
        id={`stage-${stageNumber}-allocation-direction`}
        label={intl.formatMessage(messages.stageEditorAllocationDirection)}
      >
        <Select
          aria-label={intl.formatMessage(messages.stageEditorAllocationDirection)}
          disabled={readOnly}
          id={`stage-${stageNumber}-allocation-direction`}
          onValueChange={(val) => onChange({ ...allocation, direction: val as SeedDirection })}
          options={(['higher-first', 'lower-first'] as const).map((direction) => ({
            value: direction,
            label: intl.formatMessage(ALLOCATION_DIRECTION_LABELS[direction]),
          }))}
          value={allocation.direction ?? 'higher-first'}
        />
      </Field>
    </>
  );
}

function StageStructurePreview({
  format,
  capacity,
  groupConfiguration,
}: {
  readonly format: string;
  readonly capacity?: number;
  readonly groupConfiguration?: WizardStageDraft['groupConfiguration'];
}): React.JSX.Element {
  const intl = useIntl();
  const [zoom, setZoom] = useState(1);
  const entrants = useMemo(() => derivePreviewPlaceholders(capacity), [capacity]);
  const matches = useMemo(() => generatePreviewMatches(format, entrants), [format, entrants]);
  const names = useMemo(() => generatePreviewNames(entrants), [entrants]);
  const illustrative = isIllustrativePreview(capacity);
  const isRoundRobin = format === 'league' || format.startsWith('round-robin');
  const matchdays = useMemo(() => {
    const rounds = new Map<number, typeof matches>();
    for (const match of matches) {
      rounds.set(match.round, [...(rounds.get(match.round) ?? []), match]);
    }
    return [...rounds.entries()].sort(([left], [right]) => left - right);
  }, [matches]);

  return (
    <div className="cl-stage-structure-preview" data-testid="stage-structure-preview">
      <Stack gap="2">
        <Inline align="center" justify="between" gap="2">
          <strong>
            <FormattedMessage {...messages.wizardFormatPreviewTitle} />
          </strong>
          {illustrative ? (
            <span
              className="cl-metric-strip__demonstration"
              data-testid="wizard-preview-demonstration"
            >
              <FormattedMessage {...messages.wizardFormatPreviewIllustrative} />
            </span>
          ) : (
            <span className="cl-metric-strip__demonstration" data-testid="wizard-preview-capacity">
              <FormattedMessage
                {...messages.wizardFormatPreviewCapacity}
                values={{ count: derivePreviewEntrantCount(capacity) }}
              />
            </span>
          )}
        </Inline>
        {groupConfiguration !== undefined ? (
          <GroupStructurePreview
            configuration={groupConfiguration}
            entrantCount={entrants.length}
            intl={intl}
          />
        ) : isRoundRobin ? (
          <div className="cl-stage-matchdays">
            {matchdays.map(([round, roundMatches]) => (
              <Card key={round}>
                <CardContent>
                  <Stack gap="2">
                    <strong>
                      <FormattedMessage
                        {...messages.stagePreviewMatchday}
                        values={{ number: round }}
                      />
                    </strong>
                    {roundMatches.map((match) => (
                      <div className="cl-match-card cl-match-card--skeleton" key={match.matchId}>
                        {match.slots.map((_, index) => (
                          <div
                            className="cl-match-card__slot-skeleton"
                            key={`${match.matchId}-${index}`}
                          />
                        ))}
                      </div>
                    ))}
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <BracketCanvas
            matches={matches}
            names={names}
            onZoomChange={setZoom}
            showBracketLabels={format === 'double-elimination'}
            skeletonMode
            zoom={zoom}
          />
        )}
      </Stack>
    </div>
  );
}

function GroupStructurePreview({
  configuration,
  entrantCount,
  intl,
}: {
  readonly configuration: NonNullable<WizardStageDraft['groupConfiguration']>;
  readonly entrantCount: number;
  readonly intl: IntlShape;
}): React.JSX.Element {
  return (
    <div className="cl-stage-groups">
      {groupSlotCounts(configuration, entrantCount).map((slotCount, index) => (
        <Card key={index}>
          <CardContent>
            <Stack gap="2">
              <strong>
                {intl.formatMessage(messages.stagePreviewGroup, { letter: groupLetter(index) })}
              </strong>
              {Array.from({ length: slotCount }, (_, slot) => (
                <div className="cl-group-slot-skeleton" key={slot} />
              ))}
            </Stack>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function groupLetter(index: number): string {
  let value = index + 1;
  let label = '';
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}
