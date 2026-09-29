import { useState } from 'react';
import { Alert } from '../ui/atoms/alert.js';
import { FormattedMessage, useIntl } from 'react-intl';
import { controlLinkClick } from '../../lib/control-navigation.js';
import { Button } from '../ui/atoms/button.js';
import { Form } from '../ui/atoms/form.js';
import { Field } from '../ui/molecules/field.js';
import { RulesetFieldControl } from '../ui/molecules/ruleset-field-control.js';
import { ListScreenLayout } from '../ui/layouts/list-screen-layout.js';
import { TournamentSummary } from '../ui/organisms/tournament-summary.js';
import { fieldValueAt, mergeOverrides, observedFieldValue } from '../../lib/discipline-summary.js';
import { isSupportedLanguage, resolveFieldPolicyLabel } from '@copalibre/domain';
import type {
  MutationFieldPreview,
  RulesetOverridesRequest,
  TournamentSettingsResponse,
} from '../../lib/api-client.js';
import type { ConfigFieldPolicies, RulesetConfig } from '@copalibre/domain';
import { messages } from '../../i18n/messages.en.js';

interface FieldDraft {
  readonly field: string;
  readonly value: unknown;
}

function toDrafts(overrides: Readonly<Record<string, unknown>>): FieldDraft[] {
  return Object.entries(overrides).map(([field, value]) => ({ field, value }));
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

/**
 * A published tournament's ruleset override fields — every field the installed
 * discipline descriptor marks `replaced`/`merged`, excluding `customScripts` and
 * `registration.capacity`, which keep their own dedicated screens/routes. Each
 * field renders a control typed to its declared merge behavior and value shape
 * (`RulesetFieldControl`, openspec 0264) instead of hand-typed JSON.
 */
export function TournamentRulesetTemplate({
  organizationAlias,
  tournamentAlias,
  overrides,
  fieldPolicies,
  disciplineDefaults,
  availableFormats = [],
  settings,
  onPreview,
  onSave,
}: {
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
  readonly overrides: Readonly<Record<string, unknown>>;
  readonly fieldPolicies?: ConfigFieldPolicies;
  readonly disciplineDefaults?: RulesetConfig;
  /** Constrains the `format` field's control to the installed discipline's declared formats. */
  readonly availableFormats?: readonly string[];
  /** Additive context for the plain-language summary below (openspec 0267). */
  readonly settings?: TournamentSettingsResponse;
  readonly onPreview?: (
    request: RulesetOverridesRequest,
  ) => Promise<readonly MutationFieldPreview[]>;
  readonly onSave?: (request: RulesetOverridesRequest) => Promise<void>;
}): React.JSX.Element {
  const intl = useIntl();
  const resolvedFieldPolicies = fieldPolicies ?? {};
  const resolvedDefaults = disciplineDefaults ?? {};
  const shortLocale = intl.locale.split('-')[0];
  const language = isSupportedLanguage(shortLocale) ? shortLocale : 'en';
  const [drafts, setDrafts] = useState<readonly FieldDraft[]>(toDrafts(overrides));
  const [newField, setNewField] = useState('');
  const [preview, setPreview] = useState<readonly MutationFieldPreview[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  function changedOverrides(): Record<string, unknown> {
    const changed: Record<string, unknown> = {};
    for (const draft of drafts) {
      if (JSON.stringify(overrides[draft.field]) !== JSON.stringify(draft.value)) {
        changed[draft.field] = draft.value;
      }
    }
    return changed;
  }

  const blockedField = preview.find(
    (field) => field.blocked || field.mutationClass === 'blocked_after_results',
  );

  const settingsHref = `/control/${organizationAlias}/tournaments/${tournamentAlias}/settings`;

  return (
    <ListScreenLayout
      breadcrumb={
        <span>
          {organizationAlias} &gt; {tournamentAlias}
        </span>
      }
      listing={
        <Form
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

          {fieldPolicies !== undefined && (
            <TournamentSummary
              discipline={{
                fieldPolicies,
                defaults: mergeOverrides(resolvedDefaults, overrides, resolvedFieldPolicies),
              }}
              facts={{
                name: settings?.name ?? tournamentAlias,
                region: settings?.region,
                capacity: settings?.capacity,
                checkInClosesAt: settings?.checkInClosesAt,
                publicRegistration: asBoolean(
                  fieldValueAt(
                    mergeOverrides(resolvedDefaults, overrides, resolvedFieldPolicies),
                    'registration.publicOpen',
                  ),
                ),
                requiresCheckIn: asBoolean(
                  fieldValueAt(
                    mergeOverrides(resolvedDefaults, overrides, resolvedFieldPolicies),
                    'registration.requiresCheckIn',
                  ),
                ),
              }}
              sections={['rules']}
            />
          )}

          <ul aria-label={intl.formatMessage(messages.rulesetOverridesFields)}>
            {drafts.map((draft, index) => {
              const policy = resolvedFieldPolicies[draft.field];
              const label =
                policy !== undefined
                  ? resolveFieldPolicyLabel(draft.field, policy, language)
                  : draft.field;
              return (
                <li key={draft.field}>
                  <Field id={`ruleset-field-${index}`} label={label}>
                    <RulesetFieldControl
                      addLabel={intl.formatMessage(messages.rulesetFieldListAdd)}
                      availableFormats={availableFormats}
                      disciplineDefaultValue={fieldValueAt(resolvedDefaults, draft.field)}
                      dotPath={draft.field}
                      id={`ruleset-field-${index}`}
                      inheritedHeading={intl.formatMessage(messages.rulesetFieldInheritedHeading)}
                      label={label}
                      onChange={(value) =>
                        setDrafts((current) =>
                          current.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, value } : entry,
                          ),
                        )
                      }
                      overrideValue={draft.value}
                      policy={policy}
                      removeLabel={intl.formatMessage(messages.rulesetOverridesRemoveField)}
                      unknownTypeText={intl.formatMessage(messages.rulesetFieldUnknownType)}
                      unrecognizedText={intl.formatMessage(messages.rulesetFieldUnrecognized)}
                    />
                  </Field>
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
              );
            })}
          </ul>

          <Field
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
          </Field>
          <Button
            disabled={newField.trim() === ''}
            onClick={() => {
              const field = newField.trim();
              if (field === '' || drafts.some((draft) => draft.field === field)) return;
              const initialValue = observedFieldValue(overrides, resolvedDefaults, field);
              setDrafts((current) => [...current, { field, value: initialValue }]);
              setNewField('');
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

          {error !== undefined && <Alert tone="destructive">{error}</Alert>}
          {saved && (
            <Alert tone="success">
              <FormattedMessage {...messages.settingsSaved} />
            </Alert>
          )}
        </Form>
      }
      title={<FormattedMessage {...messages.rulesetOverridesTitle} />}
    />
  );
}
