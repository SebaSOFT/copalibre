import { useEffect, useRef } from 'react';
import { useIntl } from 'react-intl';
import { isSupportedLanguage, resolveLabel, type SupportedLanguage } from '@copalibre/domain';
import type { ConsoleRoster, ConsoleRosterMember, ConsoleRosterRole } from '../lib/api-client.js';
import { memberByNumber } from '../lib/match-console.js';
import { Badge } from './ui/badge.js';
import { messages } from '../i18n/messages.en.js';

const NUMPAD_BUFFER_TIMEOUT_MS = 600;

/**
 * A tactile, high-contrast alternative to the plain `<select>` dropdowns
 * `MatchConsoleRoute` used for attributing an event: two team panels of
 * jersey buttons, on-field and bench visually separated, with role badges
 * read from the bound discipline's own `rosterRoles` declaration — never a
 * hardcoded "GK"/"C" (see 0092's design.md Decision 1 addendum).
 *
 * Selection is ambient, matching the dropdowns it replaces rather than a
 * step-by-step wizard: a jersey tap sets whichever field is currently
 * "armed" (`activeField`) — the primary actor by default, or a named
 * secondary field once the operator switches to it — and the operator picks
 * the event afterward, reading whatever is currently set. Keypad digits (0-9)
 * do the same lookup by jersey number, across both rosters at once.
 */
export function JerseyGrid({
  rosters,
  rosterRoles,
  sentOffPersonIds,
  disabled,
  primarySide,
  primaryPersonId,
  secondaryFields,
  secondarySelections,
  activeField,
  onChangeActiveField,
  onSelectPrimary,
  onSelectSecondary,
}: {
  readonly rosters: readonly ConsoleRoster[];
  readonly rosterRoles: readonly ConsoleRosterRole[];
  readonly sentOffPersonIds: ReadonlySet<string>;
  readonly disabled: boolean;
  readonly primarySide: string;
  readonly primaryPersonId: string;
  readonly secondaryFields: readonly string[];
  readonly secondarySelections: Readonly<Record<string, string>>;
  /** `undefined` means a jersey tap sets the primary actor. */
  readonly activeField: string | undefined;
  readonly onChangeActiveField: (field: string | undefined) => void;
  readonly onSelectPrimary: (entrantId: string, personId: string) => void;
  readonly onSelectSecondary: (field: string, personId: string) => void;
}): React.JSX.Element {
  const intl = useIntl();
  const language = isSupportedLanguage(intl.locale) ? intl.locale : 'en';
  const numpadBuffer = useRef('');
  const numpadTimeout = useRef<ReturnType<typeof globalThis.setTimeout> | undefined>(undefined);

  const select = (entrantId: string, personId: string): void => {
    if (activeField === undefined) onSelectPrimary(entrantId, personId);
    else onSelectSecondary(activeField, personId);
  };

  useEffect(() => {
    if (disabled) return undefined;

    function onKeyDown(event: KeyboardEvent): void {
      // Never steal digits from a text field the operator is typing into.
      const target = event.target;
      const tag = target instanceof HTMLElement ? target.tagName : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (event.key === 'Escape') {
        numpadBuffer.current = '';
        return;
      }
      if (!/^[0-9]$/.test(event.key)) return;

      numpadBuffer.current += event.key;
      globalThis.clearTimeout(numpadTimeout.current);
      const match = memberByNumber(rosters, numpadBuffer.current);
      if (match) {
        select(match.entrantId, match.member.personId);
        numpadBuffer.current = '';
        return;
      }
      numpadTimeout.current = globalThis.setTimeout(() => {
        numpadBuffer.current = '';
      }, NUMPAD_BUFFER_TIMEOUT_MS);
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      globalThis.clearTimeout(numpadTimeout.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `select` closes over the latest props each render; re-binding on every keystroke would drop the in-flight buffer.
  }, [disabled, rosters, activeField]);

  const roleByCode = new Map(rosterRoles.map((role) => [role.code, role]));

  return (
    <section
      aria-label={intl.formatMessage(messages.matchConsoleJerseyGridLabel)}
      style={gridStyle}
    >
      {secondaryFields.length > 0 && (
        <div role="tablist" style={chipRowStyle}>
          <button
            aria-pressed={activeField === undefined}
            onClick={() => onChangeActiveField(undefined)}
            style={chipStyle(activeField === undefined)}
            type="button"
          >
            {intl.formatMessage(messages.matchConsolePerson)}
          </button>
          {secondaryFields.map((field) => (
            <button
              aria-pressed={activeField === field}
              key={field}
              onClick={() => onChangeActiveField(field)}
              style={chipStyle(activeField === field)}
              type="button"
            >
              {field}
            </button>
          ))}
        </div>
      )}
      <div style={panelsStyle}>
        {rosters.map((roster) => (
          <TeamPanel
            disabled={disabled}
            key={roster.entrantId}
            language={language}
            onSelect={(personId) => select(roster.entrantId, personId)}
            primaryPersonId={roster.entrantId === primarySide ? primaryPersonId : ''}
            roleByCode={roleByCode}
            roster={roster}
            secondarySelection={
              activeField === undefined ? undefined : secondarySelections[activeField]
            }
            sentOffPersonIds={sentOffPersonIds}
          />
        ))}
      </div>
    </section>
  );
}

function TeamPanel({
  roster,
  roleByCode,
  language,
  primaryPersonId,
  secondarySelection,
  sentOffPersonIds,
  disabled,
  onSelect,
}: {
  readonly roster: ConsoleRoster;
  readonly roleByCode: ReadonlyMap<string, ConsoleRosterRole>;
  readonly language: SupportedLanguage;
  readonly primaryPersonId: string;
  readonly secondarySelection: string | undefined;
  readonly sentOffPersonIds: ReadonlySet<string>;
  readonly disabled: boolean;
  readonly onSelect: (personId: string) => void;
}): React.JSX.Element {
  const intl = useIntl();
  const onField = roster.members.filter((member) => member.onField);
  const bench = roster.members.filter((member) => !member.onField);

  const jersey = (member: ConsoleRosterMember): React.JSX.Element => {
    const sentOff = sentOffPersonIds.has(member.personId);
    const selected = member.personId === primaryPersonId || member.personId === secondarySelection;
    return (
      <JerseyButton
        disabled={disabled || sentOff}
        key={member.personId}
        language={language}
        member={member}
        onSelect={() => onSelect(member.personId)}
        roleByCode={roleByCode}
        selected={selected}
        sentOff={sentOff}
      />
    );
  };

  return (
    <div style={teamPanelStyle}>
      <h3 style={teamHeaderStyle}>{roster.entrantId.slice(-8)}</h3>
      <p style={sectionLabelStyle}>{intl.formatMessage(messages.matchConsoleOnField)}</p>
      <div style={jerseyGridStyle}>{onField.map(jersey)}</div>
      {bench.length > 0 && (
        <>
          <p style={sectionLabelStyle}>{intl.formatMessage(messages.matchConsoleBench)}</p>
          <div style={{ ...jerseyGridStyle, opacity: 0.6 }}>{bench.map(jersey)}</div>
        </>
      )}
    </div>
  );
}

function JerseyButton({
  member,
  roleByCode,
  language,
  selected,
  sentOff,
  disabled,
  onSelect,
}: {
  readonly member: ConsoleRosterMember;
  readonly roleByCode: ReadonlyMap<string, ConsoleRosterRole>;
  readonly language: SupportedLanguage;
  readonly selected: boolean;
  readonly sentOff: boolean;
  readonly disabled: boolean;
  readonly onSelect: () => void;
}): React.JSX.Element {
  const intl = useIntl();
  return (
    <button
      aria-label={
        sentOff
          ? `${member.name} — ${intl.formatMessage(messages.matchConsoleSentOff)}`
          : member.name
      }
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      style={jerseyButtonStyle(selected, sentOff)}
      type="button"
    >
      <span style={jerseyNumberStyle}>{member.number ?? '—'}</span>
      <span style={jerseyNameStyle}>{member.name}</span>
      {member.roles && member.roles.length > 0 && (
        <span style={badgeRowStyle}>
          {member.roles.map((code) => {
            const role = roleByCode.get(code);
            return (
              <Badge
                key={code}
                label={role?.badge ?? code}
                title={role ? resolveLabel(role.label, language) : code}
              />
            );
          })}
        </span>
      )}
    </button>
  );
}

const gridStyle: React.CSSProperties = { display: 'grid', gap: 'var(--cl-space-3)' };
const chipRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--cl-space-2)',
  flexWrap: 'wrap',
};
function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: 'var(--cl-space-1) var(--cl-space-3)',
    border: `1px solid ${active ? 'var(--cl-state-live)' : 'var(--cl-border-muted)'}`,
    background: active ? 'var(--cl-state-live)' : 'transparent',
    color: active ? 'var(--cl-surface-base)' : 'inherit',
  };
}
const panelsStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 'var(--cl-space-4)',
};
const teamPanelStyle: React.CSSProperties = { display: 'grid', gap: 'var(--cl-space-2)' };
const teamHeaderStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--cl-font-mono)',
};
const sectionLabelStyle: React.CSSProperties = {
  margin: 0,
  color: 'var(--cl-text-muted)',
  fontSize: '0.8rem',
  textTransform: 'uppercase',
};
const jerseyGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))',
  gap: 'var(--cl-space-2)',
};
const jerseyNumberStyle: React.CSSProperties = {
  fontFamily: 'var(--cl-font-mono)',
  fontSize: '1.25rem',
  fontWeight: 700,
};
const jerseyNameStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  textAlign: 'center',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '100%',
};
const badgeRowStyle: React.CSSProperties = { display: 'flex', gap: 'var(--cl-space-1)' };

function jerseyButtonStyle(selected: boolean, sentOff: boolean): React.CSSProperties {
  return {
    display: 'grid',
    justifyItems: 'center',
    gap: 'var(--cl-space-1)',
    padding: 'var(--cl-space-2)',
    minHeight: '64px',
    border: `2px solid ${selected ? 'var(--cl-state-live)' : 'var(--cl-border-muted)'}`,
    background: sentOff ? 'var(--cl-surface-panel)' : 'var(--cl-surface-base)',
    color: sentOff ? 'var(--cl-text-muted)' : 'inherit',
    opacity: sentOff ? 0.5 : 1,
  };
}
