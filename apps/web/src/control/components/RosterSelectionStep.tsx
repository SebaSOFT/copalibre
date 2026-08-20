import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import {
  ControlApiError,
  type ConsoleRoster,
  type ConsoleRosterRole,
  type MatchConsoleApiClient,
  type RosterCandidate,
} from '../lib/api-client.js';
import { Button } from './ui/button.js';
import { messages } from '../i18n/messages.en.js';

interface MemberSelection {
  readonly included: boolean;
  readonly number: string;
  readonly onField: boolean;
  readonly roles: readonly string[];
}

/**
 * The write side of `0092`'s jersey grid: per entrant, pick which registered
 * players are on this match's roster, their number, starter-or-bench state,
 * and any discipline-declared roster role — before recording events and
 * re-openable during the match (0107 spec).
 */
export function RosterSelectionStep({
  entrantIds,
  rosterRoles,
  existingRosters,
  organizationAlias,
  tournamentAlias,
  matchId,
  api,
  onSaved,
}: {
  readonly entrantIds: readonly string[];
  readonly rosterRoles: readonly ConsoleRosterRole[];
  readonly existingRosters: readonly ConsoleRoster[];
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
  readonly matchId: string;
  readonly api: MatchConsoleApiClient;
  readonly onSaved: () => void;
}): React.JSX.Element {
  const intl = useIntl();
  return (
    <section
      aria-label={intl.formatMessage(messages.matchConsoleRosterStepLabel)}
      style={stepStyle}
    >
      {entrantIds.map((entrantId) => (
        <EntrantRosterEditor
          api={api}
          entrantId={entrantId}
          existingRoster={existingRosters.find((roster) => roster.entrantId === entrantId)}
          key={entrantId}
          matchId={matchId}
          onSaved={onSaved}
          organizationAlias={organizationAlias}
          rosterRoles={rosterRoles}
          tournamentAlias={tournamentAlias}
        />
      ))}
    </section>
  );
}

function EntrantRosterEditor({
  entrantId,
  rosterRoles,
  existingRoster,
  organizationAlias,
  tournamentAlias,
  matchId,
  api,
  onSaved,
}: {
  readonly entrantId: string;
  readonly rosterRoles: readonly ConsoleRosterRole[];
  readonly existingRoster: ConsoleRoster | undefined;
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
  readonly matchId: string;
  readonly api: MatchConsoleApiClient;
  readonly onSaved: () => void;
}): React.JSX.Element {
  const intl = useIntl();
  const [candidates, setCandidates] = useState<readonly RosterCandidate[]>();
  const [selections, setSelections] = useState<Record<string, MemberSelection>>({});
  const [status, setStatus] = useState<{ readonly saving: boolean; readonly error?: string }>({
    saving: false,
  });

  useEffect(() => {
    let live = true;
    api
      .fetchRosterCandidates(organizationAlias, tournamentAlias, matchId, entrantId)
      .then((loaded) => {
        if (!live) return;
        setCandidates(loaded);
        setSelections((current) =>
          Object.keys(current).length > 0 ? current : initialSelections(loaded, existingRoster),
        );
      })
      .catch(() => {
        if (live)
          setStatus({
            saving: false,
            error: intl.formatMessage(messages.matchConsoleRosterLoadFailed),
          });
      });
    return () => {
      live = false;
    };
    // existingRoster is only read to seed initial state, intentionally not re-run on every projection reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, organizationAlias, tournamentAlias, matchId, entrantId]);

  const emptySelection: MemberSelection = {
    included: false,
    number: '',
    onField: false,
    roles: [],
  };

  const update = (personId: string, patch: Partial<MemberSelection>): void =>
    setSelections((current) => ({
      ...current,
      [personId]: { ...(current[personId] ?? emptySelection), ...patch },
    }));

  async function save(): Promise<void> {
    setStatus({ saving: true });
    const members = Object.entries(selections)
      .filter(([, selection]) => selection.included)
      .map(([personId, selection]) => ({
        personId,
        onField: selection.onField,
        ...(selection.number.trim() === '' ? {} : { number: selection.number.trim() }),
        ...(selection.roles.length === 0 ? {} : { roles: [...selection.roles] }),
      }));
    try {
      await api.setMatchRoster(organizationAlias, tournamentAlias, matchId, entrantId, { members });
      setStatus({ saving: false });
      onSaved();
    } catch (error) {
      setStatus({
        saving: false,
        error:
          error instanceof ControlApiError
            ? error.message
            : intl.formatMessage(messages.matchConsoleRosterSaveFailed),
      });
    }
  }

  if (!candidates) {
    return (
      <div className="cl-card cl-chamfer cl-chamfer--control" style={editorStyle}>
        {status.error ? (
          <p className="cl-inline-alert" role="alert">
            {status.error}
          </p>
        ) : (
          <p>{intl.formatMessage(messages.matchConsoleRosterLoading)}</p>
        )}
      </div>
    );
  }

  return (
    <div className="cl-card cl-chamfer cl-chamfer--control" style={editorStyle}>
      <h3 style={headerStyle}>{existingRoster?.teamName ?? entrantId.slice(-8)}</h3>
      {status.error && (
        <p className="cl-inline-alert" role="alert">
          {status.error}
        </p>
      )}
      <ul style={listStyle}>
        {candidates.map((candidate) => {
          const selection = selections[candidate.personId];
          if (!selection) return null;
          return (
            <li key={candidate.personId} style={rowStyle}>
              <label style={checkboxLabelStyle}>
                <input
                  checked={selection.included}
                  onChange={(event) =>
                    update(candidate.personId, { included: event.target.checked })
                  }
                  type="checkbox"
                />
                {candidate.name}
              </label>
              <input
                aria-label={intl.formatMessage(messages.matchConsoleRosterNumber, {
                  name: candidate.name,
                })}
                disabled={!selection.included}
                onChange={(event) => update(candidate.personId, { number: event.target.value })}
                placeholder={intl.formatMessage(messages.matchConsoleRosterNumberPlaceholder)}
                style={numberInputStyle}
                value={selection.number}
              />
              <label style={checkboxLabelStyle}>
                <input
                  checked={selection.onField}
                  disabled={!selection.included}
                  onChange={(event) =>
                    update(candidate.personId, { onField: event.target.checked })
                  }
                  type="checkbox"
                />
                {intl.formatMessage(messages.matchConsoleOnField)}
              </label>
              {rosterRoles.length > 0 && (
                <span style={roleRowStyle}>
                  {rosterRoles.map((role) => (
                    <label key={role.code} style={checkboxLabelStyle}>
                      <input
                        checked={selection.roles.includes(role.code)}
                        disabled={!selection.included}
                        onChange={(event) =>
                          update(candidate.personId, {
                            roles: event.target.checked
                              ? [...selection.roles, role.code]
                              : selection.roles.filter((code) => code !== role.code),
                          })
                        }
                        type="checkbox"
                      />
                      {role.badge ?? role.code}
                    </label>
                  ))}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {candidates.length === 0 && (
        <p style={mutedStyle}>{intl.formatMessage(messages.matchConsoleRosterNoCandidates)}</p>
      )}
      <Button disabled={status.saving} onClick={() => void save()} type="button">
        {intl.formatMessage(messages.matchConsoleRosterSave)}
      </Button>
    </div>
  );
}

function initialSelections(
  candidates: readonly RosterCandidate[],
  existingRoster: ConsoleRoster | undefined,
): Record<string, MemberSelection> {
  const byPersonId = new Map(
    (existingRoster?.members ?? []).map((member) => [member.personId, member]),
  );
  return Object.fromEntries(
    candidates.map((candidate) => {
      const member = byPersonId.get(candidate.personId);
      return [
        candidate.personId,
        {
          included: member !== undefined,
          number: member?.number !== undefined ? String(member.number) : '',
          onField: member?.onField ?? false,
          roles: member?.roles ?? [],
        },
      ];
    }),
  );
}

const stepStyle: React.CSSProperties = { display: 'grid', gap: 'var(--cl-space-4)' };
const editorStyle: React.CSSProperties = { display: 'grid', gap: 'var(--cl-space-3)' };
const headerStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--cl-font-mono)',
  textTransform: 'uppercase',
  fontSize: '0.9rem',
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
  gap: 'var(--cl-space-3)',
  flexWrap: 'wrap',
};
const checkboxLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--cl-space-1)',
  fontSize: '0.85rem',
};
const roleRowStyle: React.CSSProperties = { display: 'flex', gap: 'var(--cl-space-2)' };
const numberInputStyle: React.CSSProperties = { width: '4rem' };
const mutedStyle: React.CSSProperties = { color: 'var(--cl-text-muted)', fontSize: '0.85rem' };
