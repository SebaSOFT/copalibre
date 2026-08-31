import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { controlLinkClick } from '../lib/control-navigation.js';
import { Button } from './ui/atoms/button.js';
import { FormField } from './ui/molecules/form-field.js';
import { ListScreenTemplate } from './ui/templates/list-screen-template.js';
import type { MutationFieldPreview, RulesetOverridesRequest } from '../lib/api-client.js';
import { messages } from '../i18n/messages.en.js';

interface FieldDraft {
  readonly field: string;
  /** JSON-encoded, so a number/boolean/array/object survives round-tripping, not only a string. */
  readonly value: string;
}

function toDrafts(overrides: Readonly<Record<string, unknown>>): FieldDraft[] {
  return Object.entries(overrides).map(([field, value]) => ({
    field,
    value: JSON.stringify(value),
  }));
}

/**
 * A published tournament's ruleset override fields — every field the installed
 * discipline descriptor marks `replaced`/`merged`, excluding `customScripts` and
 * `registration.capacity`, which keep their own dedicated screens/routes. Values
 * are edited as JSON so a number, array, or object survives round-tripping the
 * same way the underlying dot-path override document stores it (design.md).
 */
export function TournamentRulesetPage({
  organizationAlias,
  tournamentAlias,
  overrides,
  onPreview,
  onSave,
}: {
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
  readonly overrides: Readonly<Record<string, unknown>>;
  readonly onPreview?: (
    request: RulesetOverridesRequest,
  ) => Promise<readonly MutationFieldPreview[]>;
  readonly onSave?: (request: RulesetOverridesRequest) => Promise<void>;
}): React.JSX.Element {
  const intl = useIntl();
  const [drafts, setDrafts] = useState<readonly FieldDraft[]>(toDrafts(overrides));
  const [newField, setNewField] = useState('');
  const [newValue, setNewValue] = useState('');
  const [preview, setPreview] = useState<readonly MutationFieldPreview[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  function changedOverrides(): Record<string, unknown> {
    const changed: Record<string, unknown> = {};
    for (const draft of drafts) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(draft.value);
      } catch {
        continue;
      }
      if (JSON.stringify(overrides[draft.field]) !== JSON.stringify(parsed)) {
        changed[draft.field] = parsed;
      }
    }
    return changed;
  }

  const blockedField = preview.find(
    (field) => field.blocked || field.mutationClass === 'blocked_after_results',
  );

  const settingsHref = `/control/${organizationAlias}/tournaments/${tournamentAlias}/settings`;

  return (
    <ListScreenTemplate
      breadcrumb={
        <span>
          {organizationAlias} &gt; {tournamentAlias}
        </span>
      }
      listing={
        <form
          className="cl-platform-form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            const changed = changedOverrides();
            if (Object.keys(changed).length === 0) return;
            setBusy(true);
            setError(undefined);
            setSaved(false);
            void onSave?.({ overrides: changed })
              .then(() => setSaved(true))
              .catch((cause: unknown) =>
                setError(cause instanceof Error ? cause.message : String(cause)),
              )
              .finally(() => setBusy(false));
          }}
        >
          <a className="cl-focusable" href={settingsHref} onClick={controlLinkClick(settingsHref)}>
            <FormattedMessage {...messages.tournamentSettingsLink} />
          </a>

          <ul aria-label={intl.formatMessage(messages.rulesetOverridesFields)}>
            {drafts.map((draft, index) => (
              <li key={draft.field}>
                <FormField id={`ruleset-field-${index}`} label={draft.field}>
                  <input
                    className="cl-input cl-input--default cl-focusable"
                    id={`ruleset-field-${index}`}
                    onChange={(event) => {
                      const value = event.target.value;
                      setDrafts((current) =>
                        current.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, value } : entry,
                        ),
                      );
                    }}
                    value={draft.value}
                  />
                </FormField>
                <Button
                  onClick={() =>
                    setDrafts((current) =>
                      current.filter((_entry, entryIndex) => entryIndex !== index),
                    )
                  }
                  type="button"
                  variant="secondary"
                >
                  <FormattedMessage {...messages.rulesetOverridesRemoveField} />
                </Button>
              </li>
            ))}
          </ul>

          <FormField
            id="ruleset-new-field-name"
            label={intl.formatMessage(messages.rulesetOverridesNewFieldLabel)}
          >
            <input
              className="cl-input cl-input--default cl-focusable"
              id="ruleset-new-field-name"
              onChange={(event) => setNewField(event.target.value)}
              placeholder="scoring.pointsPerWin"
              value={newField}
            />
          </FormField>
          <FormField
            id="ruleset-new-field-value"
            label={intl.formatMessage(messages.rulesetOverridesNewFieldValueLabel)}
          >
            <input
              className="cl-input cl-input--default cl-focusable"
              id="ruleset-new-field-value"
              onChange={(event) => setNewValue(event.target.value)}
              placeholder="4"
              value={newValue}
            />
          </FormField>
          <Button
            disabled={newField.trim() === ''}
            onClick={() => {
              const field = newField.trim();
              if (field === '' || drafts.some((draft) => draft.field === field)) return;
              setDrafts((current) => [...current, { field, value: newValue.trim() || '""' }]);
              setNewField('');
              setNewValue('');
            }}
            type="button"
            variant="secondary"
          >
            <FormattedMessage {...messages.rulesetOverridesAddField} />
          </Button>

          <div className="cl-role-user">
            <Button
              onClick={() => {
                const changed = changedOverrides();
                setBusy(true);
                setError(undefined);
                void onPreview?.({ overrides: changed })
                  .then(setPreview)
                  .catch((cause: unknown) =>
                    setError(cause instanceof Error ? cause.message : String(cause)),
                  )
                  .finally(() => setBusy(false));
              }}
              type="button"
              variant="secondary"
            >
              <FormattedMessage {...messages.settingsPreview} />
            </Button>
            <Button disabled={busy || blockedField !== undefined} type="submit">
              <FormattedMessage {...messages.settingsSave} />
            </Button>
          </div>

          {preview.length > 0 && (
            <ul aria-label={intl.formatMessage(messages.settingsPreview)}>
              {preview.map((field) => (
                <li key={field.field}>
                  <strong>{field.field}</strong>:{' '}
                  {field.blocked
                    ? field.reason
                    : intl.formatMessage(messages.settingsMutationClass, {
                        mutationClass: field.mutationClass ?? 'safe',
                      })}
                </li>
              ))}
            </ul>
          )}

          {error !== undefined && (
            <p className="cl-inline-alert" role="alert">
              {error}
            </p>
          )}
          {saved && (
            <p className="cl-inline-alert">
              <FormattedMessage {...messages.settingsSaved} />
            </p>
          )}
        </form>
      }
      title={<FormattedMessage {...messages.rulesetOverridesTitle} />}
    />
  );
}
