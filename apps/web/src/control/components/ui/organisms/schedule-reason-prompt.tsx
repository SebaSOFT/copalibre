/**
 * The reason a batch of published schedule changes needs before it publishes.
 *
 * Built for the common case — one batch reason and Enter — with exceptions one action away:
 * a row's "Different reason" toggle gives that match its own reason, and several selected
 * rows (Space, or shift-click to extend) take one shared exception reason together. The
 * coverage line says how every row is covered, and publishing stays disabled, naming why,
 * until each row is. Presentation only: the template owns when it opens and what publishing
 * does.
 */
import { useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useIntl } from 'react-intl';
import { messages } from '../../../i18n/messages.en.js';
import { Badge } from '../atoms/badge.js';
import { Button } from '../atoms/button.js';
import { Checkbox } from '../atoms/checkbox.js';
import { Combobox, type ComboboxOption } from '../atoms/combobox.js';
import { Field } from '../molecules/field.js';
import { Modal } from './modal.js';

/** A reason as the prompt hands it back: a preset's code and rendered text, or typed text. */
export interface ScheduleReasonDto {
  readonly code?: string;
  readonly text: string;
}

export interface ReasonPromptRow {
  readonly matchId: string;
  /** Which match, as an organizer names it. */
  readonly label: string;
  /** Where it was and where it goes, already formatted for reading. */
  readonly change: string;
}

export interface ReasonPromptResult {
  /** Absent when every row carries its own exception reason. */
  readonly batch?: ScheduleReasonDto;
  readonly exceptions: Readonly<Record<string, ScheduleReasonDto>>;
}

export interface ScheduleReasonPromptProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly rows: readonly ReasonPromptRow[];
  readonly presets: readonly { readonly code: string; readonly label: string }[];
  /** The organization's recent typed reasons, newest first. */
  readonly recent: readonly string[];
  readonly onPublish: (result: ReasonPromptResult) => void;
  readonly busy?: boolean;
}

interface ReasonDraft {
  readonly text: string;
  readonly code?: string;
}

const EMPTY: ReasonDraft = { text: '' };

const hasText = (reason: ReasonDraft | undefined) => (reason?.text.trim() ?? '') !== '';

const toDto = (reason: ReasonDraft): ScheduleReasonDto => ({
  ...(reason.code === undefined ? {} : { code: reason.code }),
  text: reason.text.trim(),
});

export function ScheduleReasonPrompt({
  open,
  onOpenChange,
  rows,
  presets,
  recent,
  onPublish,
  busy = false,
}: ScheduleReasonPromptProps): React.JSX.Element {
  const intl = useIntl();
  const [batch, setBatch] = useState<ReasonDraft>(EMPTY);
  /** Which exception group each excepted row belongs to; a single-row group is that row's own. */
  const [groupOf, setGroupOf] = useState<Readonly<Record<string, string>>>({});
  const [groupReasons, setGroupReasons] = useState<Readonly<Record<string, ReasonDraft>>>({});
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [anchor, setAnchor] = useState<number | undefined>(undefined);
  const [focused, setFocused] = useState(0);
  const [justOpened, setJustOpened] = useState<string | undefined>(undefined);
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);
  const sharedCounter = useRef(0);

  const options: readonly ComboboxOption[] = [
    ...presets.map((preset) => ({
      value: preset.code,
      label: preset.label,
      group: intl.formatMessage(messages.reasonPromptPresetsGroup),
    })),
    ...recent
      .filter((text) => !presets.some((preset) => preset.label === text))
      .map((text) => ({
        value: `recent:${text}`,
        label: text,
        group: intl.formatMessage(messages.reasonPromptRecentGroup),
      })),
  ];

  const draftFrom = (text: string, option?: ComboboxOption): ReasonDraft => {
    const preset = option
      ? presets.find((candidate) => candidate.code === option.value)
      : undefined;
    return preset ? { text, code: preset.code } : { text };
  };

  const exceptionRows = rows.filter((row) => groupOf[row.matchId] !== undefined);
  const batchRows = rows.filter((row) => groupOf[row.matchId] === undefined);
  const covered = (row: ReasonPromptRow): boolean => {
    const group = groupOf[row.matchId];
    return group === undefined ? hasText(batch) : hasText(groupReasons[group]);
  };
  const uncovered = rows.filter((row) => !covered(row)).length;

  function setGroup(matchIds: readonly string[], group: string | undefined): void {
    setGroupOf((current) => {
      const next: Record<string, string> = { ...current };
      for (const matchId of matchIds) {
        if (group === undefined) delete next[matchId];
        else next[matchId] = group;
      }
      return next;
    });
  }

  function toggleException(row: ReasonPromptRow): void {
    if (groupOf[row.matchId] !== undefined) {
      setGroup([row.matchId], undefined);
      return;
    }
    setGroup([row.matchId], row.matchId);
    setJustOpened(row.matchId);
  }

  function markSelected(): void {
    const matchIds = rows.map((row) => row.matchId).filter((matchId) => selected.has(matchId));
    if (matchIds.length === 0) return;
    sharedCounter.current += 1;
    const group = `shared-${sharedCounter.current}`;
    setGroup(matchIds, group);
    setJustOpened(group);
    setSelected(new Set());
  }

  function toggleSelected(index: number, extend: boolean): void {
    const row = rows[index];
    if (!row) return;
    setSelected((current) => {
      const next = new Set(current);
      if (extend && anchor !== undefined) {
        const [from, to] = anchor < index ? [anchor, index] : [index, anchor];
        for (const candidate of rows.slice(from, to + 1)) next.add(candidate.matchId);
      } else if (next.has(row.matchId)) {
        next.delete(row.matchId);
      } else {
        next.add(row.matchId);
      }
      return next;
    });
    setAnchor(index);
  }

  function focusRow(index: number): void {
    const bounded = Math.max(0, Math.min(rows.length - 1, index));
    setFocused(bounded);
    rowRefs.current[bounded]?.focus();
  }

  function publish(): void {
    if (uncovered > 0 || busy) return;
    const exceptions: Record<string, ScheduleReasonDto> = {};
    for (const row of exceptionRows) {
      const group = groupOf[row.matchId] as string;
      exceptions[row.matchId] = toDto(groupReasons[group] ?? EMPTY);
    }
    onPublish({
      ...(batchRows.length > 0 && hasText(batch) ? { batch: toDto(batch) } : {}),
      exceptions,
    });
  }

  function onRowKeyDown(event: KeyboardEvent<HTMLLIElement>, index: number): void {
    // Keys typed into a reason field are text, not commands.
    if (event.target !== event.currentTarget) return;
    const row = rows[index];
    if (!row) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      focusRow(index + (event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === ' ') {
      event.preventDefault();
      toggleSelected(index, event.shiftKey);
    } else if (event.key === 'e' || event.key === 'E') {
      event.preventDefault();
      if (selected.size > 0 && selected.has(row.matchId)) markSelected();
      else toggleException(row);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      publish();
    }
  }

  const renderedGroups = new Set<string>();
  return (
    <Modal
      closeLabel={intl.formatMessage(messages.reasonPromptClose)}
      description={intl.formatMessage(messages.reasonPromptDescription)}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} type="button" variant="secondary">
            {intl.formatMessage(messages.reasonPromptCancel)}
          </Button>
          <Button disabled={uncovered > 0 || busy} onClick={publish} type="button">
            {intl.formatMessage(messages.reasonPromptPublish)}
          </Button>
        </>
      }
      onOpenChange={onOpenChange}
      open={open}
      title={intl.formatMessage(messages.reasonPromptTitle)}
    >
      {/* Enter publishes from anywhere in the prompt once every row is covered — unless a
          suggestion list or a row already took the key for itself. */}
      <div
        className="cl-reason-prompt__body"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.defaultPrevented && !event.shiftKey) {
            event.preventDefault();
            publish();
          }
        }}
      >
        <Field
          helpText={intl.formatMessage(messages.reasonPromptKeyboardHint)}
          id="reason-prompt-batch"
          label={intl.formatMessage(messages.reasonPromptBatchLabel)}
        >
          <Combobox
            aria-describedby="reason-prompt-batch-help"
            autoFocus
            id="reason-prompt-batch"
            onValueChange={(text, option) => setBatch(draftFrom(text, option))}
            options={options}
            placeholder={intl.formatMessage(messages.reasonPromptPlaceholder)}
            value={batch.text}
          />
        </Field>

        <ul
          aria-label={intl.formatMessage(messages.reasonPromptTitle)}
          aria-multiselectable="true"
          className="cl-reason-prompt__rows"
          role="listbox"
        >
          {rows.map((row, index) => {
            const group = groupOf[row.matchId];
            const firstOfGroup = group !== undefined && !renderedGroups.has(group);
            if (group !== undefined) renderedGroups.add(group);
            const members =
              group === undefined
                ? 0
                : exceptionRows.filter((r) => groupOf[r.matchId] === group).length;
            return (
              <li
                key={row.matchId}
                ref={(element) => {
                  rowRefs.current[index] = element;
                }}
                aria-label={`${row.label} — ${row.change}`}
                aria-selected={selected.has(row.matchId)}
                className="cl-reason-prompt__row cl-focusable"
                onFocus={(event) => {
                  if (event.target === event.currentTarget) setFocused(index);
                }}
                onKeyDown={(event) => onRowKeyDown(event, index)}
                role="option"
                tabIndex={index === focused ? 0 : -1}
              >
                <div className="cl-reason-prompt__row-head">
                  <Checkbox
                    aria-label={intl.formatMessage(messages.reasonPromptSelectRow, {
                      match: row.label,
                    })}
                    checked={selected.has(row.matchId)}
                    onCheckedChange={() => undefined}
                    onClick={(event: MouseEvent<HTMLButtonElement>) => {
                      event.preventDefault();
                      toggleSelected(index, event.shiftKey);
                    }}
                    tabIndex={-1}
                  />
                  <strong>{row.label}</strong>
                  <span className="cl-reason-prompt__change">{row.change}</span>
                  {group !== undefined ? (
                    <Badge label={intl.formatMessage(messages.reasonPromptExceptionBadge)} />
                  ) : null}
                  <Button
                    aria-pressed={group !== undefined && members === 1}
                    onClick={() => toggleException(row)}
                    tabIndex={-1}
                    type="button"
                    variant="secondary"
                  >
                    {intl.formatMessage(messages.reasonPromptExceptionToggle)}
                  </Button>
                </div>
                {firstOfGroup && group !== undefined ? (
                  <Field
                    id={`reason-prompt-${group}`}
                    label={
                      members > 1
                        ? intl.formatMessage(messages.reasonPromptSharedLabel, { count: members })
                        : intl.formatMessage(messages.reasonPromptExceptionLabel, {
                            match: row.label,
                          })
                    }
                  >
                    <Combobox
                      autoFocus={justOpened === group}
                      id={`reason-prompt-${group}`}
                      onValueChange={(text, option) =>
                        setGroupReasons((current) => ({
                          ...current,
                          [group]: draftFrom(text, option),
                        }))
                      }
                      options={options}
                      placeholder={intl.formatMessage(messages.reasonPromptPlaceholder)}
                      value={groupReasons[group]?.text ?? ''}
                    />
                  </Field>
                ) : null}
              </li>
            );
          })}
        </ul>

        {selected.size > 0 ? (
          <Button onClick={markSelected} type="button" variant="secondary">
            {intl.formatMessage(messages.reasonPromptMarkSelected)}
          </Button>
        ) : null}

        <p aria-live="polite" className="cl-reason-prompt__summary">
          {intl.formatMessage(messages.reasonPromptSummary, {
            total: rows.length,
            batch: hasText(batch) ? batchRows.length : 0,
            exceptions: exceptionRows.length,
          })}
        </p>
        {uncovered > 0 ? (
          <p className="cl-reason-prompt__hint">
            {intl.formatMessage(messages.reasonPromptUncovered, { count: uncovered })}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
