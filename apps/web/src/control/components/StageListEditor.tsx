import { useEffect, useRef } from 'react';
import { FormattedMessage, useIntl, type IntlShape } from 'react-intl';
import { Button } from './ui/atoms/button.js';
import { Card, CardContent } from './ui/atoms/card.js';
import { Checkbox } from './ui/atoms/checkbox.js';
import { DecisionHint } from './ui/atoms/decision-hint.js';
import { Input } from './ui/atoms/input.js';
import { Grid } from './ui/atoms/layout/grid.js';
import { Inline } from './ui/atoms/layout/inline.js';
import { Stack } from './ui/atoms/layout/stack.js';
import { Select } from './ui/atoms/select.js';
import { Field } from './ui/molecules/field.js';
import {
  ALLOCATION_MODES,
  SERIES_RESOLUTION_CLASSES,
  appendStage,
  emptySeriesDraft,
  removeStage,
  replaceStage,
  type AllocationMode,
  type SeedDirection,
  type SeriesResolutionClass,
  type WizardStageDraft,
} from '../lib/stage-authoring.js';
import { messages } from '../i18n/messages.en.js';

const SERIES_CLASS_LABELS: Record<SeriesResolutionClass, typeof messages.wizardSeriesClassBestOf> =
  {
    'best-of': messages.wizardSeriesClassBestOf,
    aggregate: messages.wizardSeriesClassAggregate,
    'points-per-leg': messages.wizardSeriesClassPointsPerLeg,
  };

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
  showAllocation = false,
  attributeKeys = [],
  readOnly = false,
  formatHintText,
}: {
  readonly stages: readonly WizardStageDraft[];
  readonly formats: readonly string[];
  readonly onChange?: (stages: readonly WizardStageDraft[]) => void;
  /** `TournamentSetupWizard` declares per-stage series; `ProfileBuilderWizard` does not. */
  readonly showSeries?: boolean;
  readonly showAllocation?: boolean;
  readonly attributeKeys?: readonly string[];
  readonly readOnly?: boolean;
  /** The discipline's own format decision hint (description, reversibility) — same for every stage. */
  readonly formatHintText?: string;
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
                        options={formats.map((format) => ({ value: format, label: format }))}
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
                      intl={intl}
                      onChange={(series) => patchStage(stage.number, { series })}
                      readOnly={readOnly}
                      stage={stage}
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

function SeriesFields({
  stage,
  intl,
  onChange,
  readOnly,
}: {
  readonly stage: WizardStageDraft;
  readonly intl: IntlShape;
  readonly onChange: (series: WizardStageDraft['series']) => void;
  readonly readOnly: boolean;
}): React.JSX.Element {
  const enabled = stage.series !== undefined;
  // Toggling off declares no series, but the operator's own values survive
  // the round trip — re-enabling restores them rather than a blank draft,
  // the same way span and resolution class always have.
  const lastSeries = useRef<WizardStageDraft['series']>(stage.series);
  useEffect(() => {
    if (stage.series !== undefined) lastSeries.current = stage.series;
  }, [stage.series]);

  return (
    <Stack gap="3">
      <Inline align="center" className="cl-toggle cl-focusable" gap="2">
        <Checkbox
          aria-label={intl.formatMessage(messages.stageEditorSeriesToggle)}
          checked={enabled}
          disabled={readOnly}
          id={`stage-${stage.number}-series-enable`}
          onCheckedChange={(checked) =>
            onChange(checked ? (lastSeries.current ?? emptySeriesDraft()) : undefined)
          }
        />
        <span>
          <FormattedMessage {...messages.stageEditorSeriesToggle} />
        </span>
      </Inline>

      {enabled && stage.series && (
        <SeriesValueFields
          intl={intl}
          onChange={onChange}
          readOnly={readOnly}
          series={stage.series}
          stageNumber={stage.number}
        />
      )}
    </Stack>
  );
}

function SeriesValueFields({
  series,
  stageNumber,
  intl,
  onChange,
  readOnly,
}: {
  readonly series: NonNullable<WizardStageDraft['series']>;
  readonly stageNumber: number;
  readonly intl: IntlShape;
  readonly onChange: (series: WizardStageDraft['series']) => void;
  readonly readOnly: boolean;
}): React.JSX.Element {
  return (
    <Stack gap="3">
      <Grid columns={2} gap="3">
        <Field
          id={`stage-${stageNumber}-series-span`}
          label={intl.formatMessage(messages.stageEditorSeriesSpan)}
        >
          <Input
            disabled={readOnly}
            id={`stage-${stageNumber}-series-span`}
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
          id={`stage-${stageNumber}-series-class`}
          label={intl.formatMessage(messages.stageEditorSeriesResolutionClass)}
        >
          <Select
            aria-label={intl.formatMessage(messages.stageEditorSeriesResolutionClass)}
            disabled={readOnly}
            id={`stage-${stageNumber}-series-class`}
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
          id={`stage-${stageNumber}-series-neutral`}
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
          id={`stage-${stageNumber}-series-per-series`}
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
