import { useState, type ReactNode } from 'react';
import { FormattedMessage } from 'react-intl';
import { resolveLabel, type SupportedLanguage } from '@copalibre/domain';
import type { ConsoleSegment, MatchConsoleResponse } from '../../lib/api-client.js';
import {
  type ClockAction,
  type ClockActions,
  REOPEN_REASON_MAX_LENGTH,
  reopenReasonValidOf,
} from '../../lib/match-console.js';
import { Alert } from '../ui/atoms/alert.js';
import { Button } from '../ui/atoms/button.js';
import { Input } from '../ui/atoms/input.js';
import { Select } from '../ui/atoms/select.js';
import { Field } from '../ui/molecules/field.js';
import { messages } from '../../i18n/messages.en.js';
import { variantOf } from './match-console-model.js';

/** The line under the clock card while no segment exists: what Start creates, else that there are none. */
export function NoSegmentsLine({
  language,
  projection,
}: {
  readonly language: SupportedLanguage;
  readonly projection: MatchConsoleResponse;
}) {
  const regulation = projection.segmentPlan.regulation;
  if (projection.status !== 'scheduled' || regulation === undefined) {
    return <FormattedMessage {...messages.matchConsoleNoSegments} />;
  }
  return (
    <FormattedMessage
      {...messages.matchConsoleStartCreates}
      values={{
        count: regulation.count,
        type: resolveLabel(regulation.typeLabel ?? regulation.type, language),
      }}
    />
  );
}

interface AddSegmentFieldProps {
  readonly disabled: boolean;
  readonly labels: {
    readonly button: ReactNode;
    readonly field: string;
    readonly placeholder: string;
  };
  readonly onAdd: (type: string) => Promise<void> | void;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly visible: boolean;
}

/** The line that names the running segment when another one holds the clock. */
export function RunningSegmentLine({
  segmentText,
  segment,
}: {
  readonly segmentText: (segment: ConsoleSegment) => string;
  readonly segment: ConsoleSegment | undefined;
}) {
  if (segment === undefined) return null;
  return (
    <p className="cl-card__description">
      <FormattedMessage
        {...messages.matchConsoleAnotherSegmentRunning}
        values={{ segment: segmentText(segment) }}
      />
    </p>
  );
}

interface ReopenSegmentConfirmationProps {
  readonly labels: {
    readonly cancel: string;
    readonly confirm: string;
    readonly dismiss: string;
    readonly reason: string;
    readonly question: (segment: string) => string;
  };
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly onReason: (reason: string) => void;
  readonly segmentText: (segment: ConsoleSegment) => string;
  readonly reason: string;
  readonly segment: ConsoleSegment | undefined;
  readonly visible: boolean;
}

/** The reopen confirmation, in the finalize card's pattern: a reason is required and it is cancellable. */
export function ReopenSegmentConfirmation({
  labels,
  onCancel,
  onConfirm,
  onReason,
  segmentText,
  reason,
  segment,
  visible,
}: ReopenSegmentConfirmationProps) {
  if (!visible || segment === undefined) return null;
  return (
    // Stacked under its question: inline, the reason field and both buttons squeeze into one row
    // and become unreadable at phone width.
    <Alert
      block
      dismissLabel={labels.dismiss}
      heading={labels.question(segmentText(segment))}
      onDismiss={onCancel}
      tone="warning"
    >
      <Field id="console-reopen-reason" label={labels.reason}>
        <Input
          aria-label={labels.reason}
          id="console-reopen-reason"
          maxLength={REOPEN_REASON_MAX_LENGTH}
          onChange={(event) => onReason(event.target.value)}
          value={reason}
        />
      </Field>
      <div className="cl-role-user">
        <Button onClick={onCancel} type="button" variant="secondary">
          {labels.cancel}
        </Button>
        <Button
          disabled={!reopenReasonValidOf(reason)}
          onClick={onConfirm}
          type="button"
          variant="primary"
        >
          {labels.confirm}
        </Button>
      </div>
    </Alert>
  );
}

interface ClockCorrectionFormProps {
  readonly canCorrect: boolean;
  readonly disabled: boolean;
  readonly labels: { readonly button: ReactNode; readonly field: string };
  readonly onChange: (value: string) => void;
  readonly onCorrect: () => void;
  readonly value: string;
  readonly visible: boolean;
}

/** The time correction: a minutes:seconds field and its Correct button, withheld on a finalized match. */
export function ClockCorrectionForm({
  canCorrect,
  disabled,
  labels,
  onChange,
  onCorrect,
  value,
  visible,
}: ClockCorrectionFormProps) {
  if (!visible) return null;
  return (
    <div className="cl-platform-form-grid">
      <Field id="console-clock-time" label={labels.field}>
        <Input
          aria-label={labels.field}
          disabled={disabled}
          id="console-clock-time"
          onChange={(event) => onChange(event.target.value)}
          value={value}
        />
      </Field>
      <Button
        disabled={disabled || !canCorrect}
        onClick={onCorrect}
        type="button"
        variant="secondary"
      >
        {labels.button}
      </Button>
    </div>
  );
}

/** The Add segment choice: a declared type picked and appended, offered only while the match is in progress. */
export function AddSegmentField({
  disabled,
  labels,
  onAdd,
  options,
  visible,
}: AddSegmentFieldProps) {
  const [pick, setPick] = useState('');
  // Held until the addition is queued and a send attempted, so a second tap cannot queue a
  // second segment while the first one has not reached the segment list yet.
  const [adding, setAdding] = useState(false);
  if (!visible || options.length === 0) return null;
  const value = options.some((option) => option.value === pick) ? pick : (options[0]?.value ?? '');
  return (
    <div className="cl-platform-form-grid">
      <Field id="console-add-segment" label={labels.field}>
        <Select
          aria-label={labels.field}
          disabled={disabled}
          id="console-add-segment"
          onValueChange={setPick}
          options={options}
          placeholder={labels.placeholder}
          value={value}
        />
      </Field>
      <Button
        disabled={disabled || adding || value === ''}
        onClick={() => {
          setAdding(true);
          void Promise.resolve(onAdd(value)).finally(() => setAdding(false));
        }}
        type="button"
        variant="secondary"
      >
        {labels.button}
      </Button>
    </div>
  );
}

/** The clock actions the match state allows; renders nothing when there are none. */
export function ClockCommands({
  actions,
  disabled,
  label,
  labels,
  onAction,
}: {
  readonly actions: ClockActions['actions'];
  readonly disabled: boolean;
  readonly label: string;
  readonly labels: Readonly<Record<ClockAction, string>>;
  readonly onAction: (action: ClockAction) => void;
}): React.JSX.Element | null {
  if (actions.length === 0) return null;
  return (
    <div className="cl-clock-commands" role="group" aria-label={label}>
      {actions.map(({ action, primary }) => (
        <Button
          disabled={disabled}
          key={action}
          onClick={() => onAction(action)}
          type="button"
          variant={variantOf(primary)}
        >
          {labels[action]}
        </Button>
      ))}
    </div>
  );
}
