import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Button } from './ui/atoms/button.js';
import { Checkbox } from './ui/atoms/checkbox.js';
import { Input } from './ui/atoms/input.js';
import { Select } from './ui/atoms/select.js';
import { Inline } from './ui/atoms/layout/inline.js';
import { Stack } from './ui/atoms/layout/stack.js';
import {
  ACTOR_REQUIREMENTS,
  AGGREGATION_MODES,
  EVENT_CATEGORIES,
  type EventDefinitionDraft,
  type ScoringInputDraft,
  type SegmentTypeDraft,
  type StatisticDraft,
} from '../lib/descriptor-authoring.js';
import { messages } from '../i18n/messages.en.js';

export function SegmentTypeList({
  segments,
  onAdd,
  onRemove,
}: {
  readonly segments: readonly SegmentTypeDraft[];
  readonly onAdd: (segment: SegmentTypeDraft) => void;
  readonly onRemove: (index: number) => void;
}): React.JSX.Element {
  const intl = useIntl();
  const [draft, setDraft] = useState<{
    name: string;
    label: string;
    timed: boolean;
    defaultDurationSeconds: string;
  }>({ name: '', label: '', timed: false, defaultDurationSeconds: '' });
  return (
    <Stack gap="3">
      {segments.length > 0 && (
        <ul>
          {segments.map((segment, index) => (
            <li key={`${segment.name}-${index}`}>
              {segment.name} — {segment.label} ({segment.timed ? 'timed' : 'untimed'})
              <Button onClick={() => onRemove(index)} type="button" variant="secondary">
                <FormattedMessage {...messages.descriptorRemove} />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="cl-platform-form-grid">
        <Input
          aria-label={intl.formatMessage(messages.descriptorFieldSegmentTypeName)}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          placeholder={intl.formatMessage(messages.descriptorFieldSegmentTypeName)}
          value={draft.name}
        />
        <Input
          aria-label={intl.formatMessage(messages.descriptorFieldSegmentTypeLabel)}
          onChange={(event) => setDraft({ ...draft, label: event.target.value })}
          placeholder={intl.formatMessage(messages.descriptorFieldSegmentTypeLabel)}
          value={draft.label}
        />
        <label
          className="cl-toggle cl-focusable"
          style={{ display: 'flex', gap: 'var(--cl-space-2)' }}
        >
          <Checkbox
            aria-label={intl.formatMessage(messages.descriptorFieldSegmentTimed)}
            checked={draft.timed}
            id="descriptor-segment-timed"
            onCheckedChange={(checked) => setDraft({ ...draft, timed: checked })}
          />
          <span>
            <FormattedMessage {...messages.descriptorFieldSegmentTimed} />
          </span>
        </label>
        <Button
          disabled={draft.name.trim() === '' || draft.label.trim() === ''}
          onClick={() => {
            onAdd({
              name: draft.name.trim(),
              label: draft.label.trim(),
              timed: draft.timed,
              ...(draft.defaultDurationSeconds.trim() === ''
                ? {}
                : { defaultDurationSeconds: Number(draft.defaultDurationSeconds) }),
            });
            setDraft({ name: '', label: '', timed: false, defaultDurationSeconds: '' });
          }}
          type="button"
          variant="secondary"
        >
          <FormattedMessage {...messages.descriptorAdd} />
        </Button>
      </div>
    </Stack>
  );
}

export function StatisticList({
  statistics,
  onAdd,
  onRemove,
}: {
  readonly statistics: readonly StatisticDraft[];
  readonly onAdd: (statistic: StatisticDraft) => void;
  readonly onRemove: (index: number) => void;
}): React.JSX.Element {
  const intl = useIntl();
  const [draft, setDraft] = useState<{
    code: string;
    label: string;
    aggregation: StatisticDraft['aggregation'];
  }>({ code: '', label: '', aggregation: 'sum' });
  return (
    <Stack gap="3">
      {statistics.length > 0 && (
        <ul>
          {statistics.map((statistic, index) => (
            <li key={`${statistic.code}-${index}`}>
              {statistic.code} — {statistic.label} ({statistic.aggregation})
              <Button onClick={() => onRemove(index)} type="button" variant="secondary">
                <FormattedMessage {...messages.descriptorRemove} />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="cl-platform-form-grid">
        <Input
          aria-label={intl.formatMessage(messages.descriptorFieldStatisticCode)}
          onChange={(event) => setDraft({ ...draft, code: event.target.value })}
          placeholder={intl.formatMessage(messages.descriptorFieldStatisticCode)}
          value={draft.code}
        />
        <Input
          aria-label={intl.formatMessage(messages.descriptorFieldStatisticLabel)}
          onChange={(event) => setDraft({ ...draft, label: event.target.value })}
          placeholder={intl.formatMessage(messages.descriptorFieldStatisticLabel)}
          value={draft.label}
        />
        <Select
          aria-label={intl.formatMessage(messages.descriptorFieldAggregation)}
          id="descriptor-statistic-aggregation"
          onValueChange={(val) =>
            setDraft({ ...draft, aggregation: val as StatisticDraft['aggregation'] })
          }
          options={AGGREGATION_MODES.map((mode) => ({
            value: mode,
            label: mode,
          }))}
          value={draft.aggregation}
        />
        <Button
          disabled={draft.code.trim() === '' || draft.label.trim() === ''}
          onClick={() => {
            onAdd({
              code: draft.code.trim(),
              label: draft.label.trim(),
              aggregation: draft.aggregation,
            });
            setDraft({ code: '', label: '', aggregation: 'sum' });
          }}
          type="button"
          variant="secondary"
        >
          <FormattedMessage {...messages.descriptorAdd} />
        </Button>
      </div>
    </Stack>
  );
}

export function EventDefinitionList({
  events,
  statistics,
  segmentTypes,
  onAdd,
  onRemove,
}: {
  readonly events: readonly EventDefinitionDraft[];
  readonly statistics: readonly StatisticDraft[];
  readonly segmentTypes: readonly SegmentTypeDraft[];
  readonly onAdd: (event: EventDefinitionDraft) => void;
  readonly onRemove: (index: number) => void;
}): React.JSX.Element {
  const intl = useIntl();
  const [draft, setDraft] = useState<{
    code: string;
    label: string;
    category: EventDefinitionDraft['category'];
    actorRequirement: EventDefinitionDraft['actorRequirement'];
    permittedSegmentTypes: readonly string[];
    awardsStatisticCode: string;
    awardsDelta: string;
  }>({
    code: '',
    label: '',
    category: 'positive',
    actorRequirement: 'side',
    permittedSegmentTypes: [],
    awardsStatisticCode: '',
    awardsDelta: '1',
  });
  return (
    <Stack gap="3">
      {events.length > 0 && (
        <ul>
          {events.map((event, index) => (
            <li key={`${event.code}-${index}`}>
              {event.code} — {event.label} ({event.category})
              {event.awardsStatisticCode
                ? ` → +${event.awardsDelta} ${event.awardsStatisticCode}`
                : ''}
              <Button onClick={() => onRemove(index)} type="button" variant="secondary">
                <FormattedMessage {...messages.descriptorRemove} />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="cl-platform-form-grid">
        <Input
          aria-label={intl.formatMessage(messages.descriptorFieldEventCode)}
          onChange={(event) => setDraft({ ...draft, code: event.target.value })}
          placeholder={intl.formatMessage(messages.descriptorFieldEventCode)}
          value={draft.code}
        />
        <Input
          aria-label={intl.formatMessage(messages.descriptorFieldEventLabel)}
          onChange={(event) => setDraft({ ...draft, label: event.target.value })}
          placeholder={intl.formatMessage(messages.descriptorFieldEventLabel)}
          value={draft.label}
        />
        <Select
          aria-label={intl.formatMessage(messages.descriptorFieldEventCategory)}
          id="descriptor-event-category"
          onValueChange={(val) =>
            setDraft({ ...draft, category: val as EventDefinitionDraft['category'] })
          }
          options={EVENT_CATEGORIES.map((category) => ({
            value: category,
            label: category,
          }))}
          value={draft.category}
        />
        <Select
          aria-label={intl.formatMessage(messages.descriptorFieldEventActorRequirement)}
          id="descriptor-event-actor-requirement"
          onValueChange={(val) =>
            setDraft({
              ...draft,
              actorRequirement: val as EventDefinitionDraft['actorRequirement'],
            })
          }
          options={ACTOR_REQUIREMENTS.map((requirement) => ({
            value: requirement,
            label: requirement,
          }))}
          value={draft.actorRequirement}
        />
        <Select
          aria-label={intl.formatMessage(messages.descriptorFieldEventAwardsStatistic)}
          id="descriptor-event-awards-statistic"
          onValueChange={(val) => setDraft({ ...draft, awardsStatisticCode: val })}
          options={[
            { value: '', label: intl.formatMessage(messages.descriptorEventAwardsNone) },
            ...statistics.map((statistic) => ({
              value: statistic.code,
              label: statistic.code,
            })),
          ]}
          value={draft.awardsStatisticCode}
        />
        {draft.awardsStatisticCode !== '' && (
          <Input
            aria-label={intl.formatMessage(messages.descriptorFieldEventAwardsDelta)}
            onChange={(event) => setDraft({ ...draft, awardsDelta: event.target.value })}
            type="number"
            value={draft.awardsDelta}
          />
        )}
        {segmentTypes.length > 0 && (
          <Inline gap="2" wrap>
            {segmentTypes.map((segment) => (
              <label
                key={segment.name}
                className="cl-toggle cl-focusable"
                style={{ display: 'flex', gap: 'var(--cl-space-2)' }}
              >
                <Checkbox
                  aria-label={segment.name}
                  checked={draft.permittedSegmentTypes.includes(segment.name)}
                  id={`descriptor-permitted-segment-${segment.name}`}
                  onCheckedChange={(checked) =>
                    setDraft({
                      ...draft,
                      permittedSegmentTypes: checked
                        ? [...draft.permittedSegmentTypes, segment.name]
                        : draft.permittedSegmentTypes.filter((name) => name !== segment.name),
                    })
                  }
                />
                <span>{segment.name}</span>
              </label>
            ))}
          </Inline>
        )}
        <Button
          disabled={draft.code.trim() === '' || draft.label.trim() === ''}
          onClick={() => {
            onAdd({
              code: draft.code.trim(),
              label: draft.label.trim(),
              category: draft.category,
              actorRequirement: draft.actorRequirement,
              permittedSegmentTypes: draft.permittedSegmentTypes,
              awardsDelta: Number(draft.awardsDelta) || 1,
              ...(draft.awardsStatisticCode === ''
                ? {}
                : { awardsStatisticCode: draft.awardsStatisticCode }),
            });
            setDraft({
              code: '',
              label: '',
              category: 'positive',
              actorRequirement: 'side',
              permittedSegmentTypes: [],
              awardsStatisticCode: '',
              awardsDelta: '1',
            });
          }}
          type="button"
          variant="secondary"
        >
          <FormattedMessage {...messages.descriptorAdd} />
        </Button>
      </div>
    </Stack>
  );
}

export function ScoringInputList({
  inputs,
  onAdd,
  onRemove,
}: {
  readonly inputs: readonly ScoringInputDraft[];
  readonly onAdd: (input: ScoringInputDraft) => void;
  readonly onRemove: (index: number) => void;
}): React.JSX.Element {
  const intl = useIntl();
  const [draft, setDraft] = useState<{
    code: string;
    label: string;
    source: ScoringInputDraft['source'];
  }>({
    code: '',
    label: '',
    source: 'event-derived',
  });
  return (
    <Stack gap="3">
      {inputs.length > 0 && (
        <ul>
          {inputs.map((input, index) => (
            <li key={`${input.code}-${index}`}>
              {input.code} — {input.label} ({input.source})
              <Button onClick={() => onRemove(index)} type="button" variant="secondary">
                <FormattedMessage {...messages.descriptorRemove} />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="cl-platform-form-grid">
        <Input
          aria-label={intl.formatMessage(messages.descriptorFieldScoringInputCode)}
          onChange={(event) => setDraft({ ...draft, code: event.target.value })}
          placeholder={intl.formatMessage(messages.descriptorFieldScoringInputCode)}
          value={draft.code}
        />
        <Input
          aria-label={intl.formatMessage(messages.descriptorFieldScoringInputLabel)}
          onChange={(event) => setDraft({ ...draft, label: event.target.value })}
          placeholder={intl.formatMessage(messages.descriptorFieldScoringInputLabel)}
          value={draft.label}
        />
        <Select
          aria-label={intl.formatMessage(messages.descriptorFieldScoringInputSource)}
          id="descriptor-scoring-input-source"
          onValueChange={(val) =>
            setDraft({ ...draft, source: val as ScoringInputDraft['source'] })
          }
          options={[
            { value: 'event-derived', label: 'event-derived' },
            { value: 'operator-entered', label: 'operator-entered' },
          ]}
          value={draft.source}
        />
        <Button
          disabled={draft.code.trim() === '' || draft.label.trim() === ''}
          onClick={() => {
            onAdd({ code: draft.code.trim(), label: draft.label.trim(), source: draft.source });
            setDraft({ code: '', label: '', source: 'event-derived' });
          }}
          type="button"
          variant="secondary"
        >
          <FormattedMessage {...messages.descriptorAdd} />
        </Button>
      </div>
    </Stack>
  );
}
