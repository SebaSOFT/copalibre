import { useState } from 'react';
import { Alert } from '../ui/atoms/alert.js';
import { FormattedMessage, useIntl } from 'react-intl';
import { controlLinkClick } from '../../lib/control-navigation.js';
import { Button } from '../ui/atoms/button.js';
import { Form } from '../ui/atoms/form.js';
import { Field } from '../ui/molecules/field.js';
import { Badge } from '../ui/atoms/badge.js';
import { Label } from '../ui/atoms/label.js';
import { LinkButton } from '../ui/atoms/link-button.js';
import { DataTable, type DataTableColumn } from '../ui/organisms/data-table.js';
import { SectionTabList } from '../ui/organisms/section-tabs.js';
import { UnsavedChangesBar } from '../ui/organisms/unsaved-changes-bar.js';
import { RulesetFieldControl } from '../ui/molecules/ruleset-field-control.js';
import { PageHeaderTemplate } from './PageHeaderTemplate.js';
import { TournamentSummary } from '../ui/organisms/tournament-summary.js';
import {
  chooseControlKind,
  fieldValueAt,
  formatFieldValue,
  mergeOverrides,
  observedFieldValue,
} from '../../lib/discipline-summary.js';
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

type RulesetCategory = 'format' | 'scoring' | 'tiebreakers' | 'registration' | 'other';

const CATEGORY_ORDER: readonly RulesetCategory[] = [
  'format',
  'scoring',
  'tiebreakers',
  'registration',
  'other',
];

/** Groups a field by its declared path alone; a path it does not recognise lands in `other`. */
function categoryOf(field: string): RulesetCategory {
  if (/^(registration|checkIn)\b/.test(field)) return 'registration';
  if (/^(scoring\.|pointsPer)/.test(field)) return 'scoring';
  if (/^tiebreakers?\b/.test(field)) return 'tiebreakers';
  if (/^(format|segments|series|winCondition|tableLayouts|neutral)/.test(field)) return 'format';
  return 'other';
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

/**
 * A published tournament's ruleset override fields — every field the installed
 * discipline descriptor marks `replaced`/`merged`, excluding `customScripts` and
 * `registration.capacity`, which keep their own dedicated screens/routes. Each
 * field renders a control typed to its declared merge behavior and value shape
 * (`RulesetFieldControl`) instead of hand-typed JSON.
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
  /** Additive context for the plain-language summary below. */
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
  const [category, setCategory] = useState<'all' | RulesetCategory>('all');

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
  const mergedConfig = mergeOverrides(resolvedDefaults, overrides, resolvedFieldPolicies);
  const changed = changedOverrides();
  const changedKeys = Object.keys(changed);

  interface RulesetRow {
    readonly field: string;
    /** Index in `drafts` when the tournament overrides this field; absent: the discipline default applies. */
    readonly index?: number;
  }
  const draftFields = new Set(drafts.map((draft) => draft.field));
  const allRows: readonly RulesetRow[] = [
    ...Object.keys(resolvedFieldPolicies)
      .filter(
        (field) =>
          draftFields.has(field) ||
          (field !== 'customScripts' &&
            field !== 'registration.capacity' &&
            chooseControlKind(
              resolvedFieldPolicies[field],
              observedFieldValue(overrides, resolvedDefaults, field),
              field,
            ) !== undefined),
      )
      .map((field) => ({ field, index: drafts.findIndex((draft) => draft.field === field) })),
    ...drafts
      .map((draft, index) => ({ field: draft.field, index }))
      .filter(({ field }) => !(field in resolvedFieldPolicies)),
  ].map((row) => (row.index === undefined || row.index < 0 ? { field: row.field } : row));

  const categories = CATEGORY_ORDER.filter((id) =>
    allRows.some((row) => categoryOf(row.field) === id),
  );
  const activeCategory = category === 'all' || categories.includes(category) ? category : 'all';
  const visible = allRows.filter(
    (row) => activeCategory === 'all' || categoryOf(row.field) === activeCategory,
  );
  const categoryLabel: Record<RulesetCategory, string> = {
    format: intl.formatMessage(messages.rulesetTabFormat),
    scoring: intl.formatMessage(messages.rulesetTabScoring),
    tiebreakers: intl.formatMessage(messages.rulesetTabTiebreakers),
    registration: intl.formatMessage(messages.rulesetTabRegistration),
    other: intl.formatMessage(messages.rulesetTabOther),
  };

  function save(): void {
    if (changedKeys.length === 0) return;
    setBusy(true);
    setError(undefined);
    setSaved(false);
    void onSave?.({ overrides: changed })
      .then(() => setSaved(true))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setBusy(false));
  }

  function previewChanges(): void {
    setBusy(true);
    setError(undefined);
    void onPreview?.({ overrides: changed })
      .then(setPreview)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setBusy(false));
  }

  function labelOf(field: string): string {
    const policy = resolvedFieldPolicies[field];
    return policy !== undefined ? resolveFieldPolicyLabel(field, policy, language) : field;
  }

  const columns: readonly DataTableColumn<RulesetRow>[] = [
    {
      key: 'parameter',
      header: intl.formatMessage(messages.rulesetColumnParameter),
      render: ({ field }) => (
        <div className="cl-ruleset__parameter">
          <strong>{labelOf(field)}</strong>
          {labelOf(field) !== field && <code className="cl-ruleset__key">{field}</code>}
        </div>
      ),
    },
    {
      key: 'value',
      header: intl.formatMessage(messages.rulesetColumnValue),
      render: ({ field, index }) => {
        const draft = index === undefined ? undefined : drafts[index];
        if (draft === undefined || index === undefined) {
          return (
            <span className="cl-ruleset__current">
              {formatFieldValue(fieldValueAt(mergedConfig, field), intl)}
            </span>
          );
        }
        const policy = resolvedFieldPolicies[field];
        const label = labelOf(field);
        const controlKind = chooseControlKind(policy, draft.value, field);
        const editor = (
          <RulesetFieldControl
            addLabel={intl.formatMessage(messages.rulesetFieldListAdd)}
            availableFormats={availableFormats}
            disciplineDefaultValue={fieldValueAt(resolvedDefaults, field)}
            dotPath={field}
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
            selectPlaceholder={intl.formatMessage(messages.selectPlaceholder)}
            unknownTypeText={intl.formatMessage(messages.rulesetFieldUnknownType)}
            unrecognizedText={intl.formatMessage(messages.rulesetFieldUnrecognized)}
          />
        );
        return controlKind === 'raw-json' ? (
          editor
        ) : (
          <div className="cl-ruleset__value">
            <Label className="cl-visually-hidden" htmlFor={`ruleset-field-${index}`}>
              {label}
            </Label>
            {editor}
          </div>
        );
      },
    },
    {
      key: 'source',
      header: intl.formatMessage(messages.rulesetColumnSource),
      render: ({ field, index }) =>
        index === undefined ? (
          <Badge
            className="cl-state--muted"
            label={intl.formatMessage(messages.rulesetSourceDefault)}
          />
        ) : field in changed ? (
          <Badge
            className="cl-state--upcoming"
            label={intl.formatMessage(messages.rulesetSourceModified)}
          />
        ) : (
          <Badge label={intl.formatMessage(messages.rulesetSourceOverride)} />
        ),
    },
    {
      key: 'action',
      header: intl.formatMessage(messages.rulesetColumnAction),
      render: ({ field, index }) =>
        index === undefined ? (
          <Button
            onClick={() =>
              setDrafts((current) => [
                ...current,
                { field, value: observedFieldValue(overrides, resolvedDefaults, field) },
              ])
            }
            type="button"
            variant="secondary"
          >
            <FormattedMessage {...messages.rulesetActionOverride} />
          </Button>
        ) : (
          <Button
            onClick={() =>
              setDrafts((current) => current.filter((_entry, entryIndex) => entryIndex !== index))
            }
            type="button"
            variant="secondary"
          >
            <FormattedMessage {...messages.rulesetOverridesRemoveField} />
          </Button>
        ),
    },
  ];

  return (
    <PageHeaderTemplate
      actions={
        <div className="cl-tournament-settings__header-actions">
          <LinkButton
            href={settingsHref}
            onClick={controlLinkClick(settingsHref)}
            variant="secondary"
          >
            <FormattedMessage {...messages.tournamentSettingsLink} />
          </LinkButton>
          <Button disabled={busy} onClick={previewChanges} type="button" variant="secondary">
            <FormattedMessage {...messages.settingsPreview} />
          </Button>
        </div>
      }
      legacyBreadcrumb={
        <span>
          {organizationAlias} &gt; {tournamentAlias}
        </span>
      }
      title={<FormattedMessage {...messages.rulesetOverridesTitle} />}
    >
      <div className="cl-ruleset">
        {categories.length > 1 && (
          <SectionTabList
            ariaLabel={intl.formatMessage(messages.rulesetSections)}
            currentTabId={activeCategory}
            idPrefix="ruleset"
            onSelect={(id) => setCategory(categories.find((entry) => entry === id) ?? 'all')}
            tabs={[
              { id: 'all', label: intl.formatMessage(messages.rulesetTabAll) },
              ...categories.map((id) => ({ id, label: categoryLabel[id] })),
            ]}
          />
        )}

        <div
          aria-labelledby={categories.length > 1 ? `ruleset-${activeCategory}-tab` : undefined}
          id={`ruleset-${activeCategory}-panel`}
          role={categories.length > 1 ? 'tabpanel' : undefined}
        >
          <DataTable
            ariaLabel={intl.formatMessage(messages.rulesetOverridesFields)}
            columns={columns}
            rowKey={({ field }) => field}
            rows={visible}
          />
        </div>

        <Form
          onSubmit={(event) => {
            event.preventDefault();
            const field = newField.trim();
            if (field === '' || drafts.some((draft) => draft.field === field)) return;
            const initialValue = observedFieldValue(overrides, resolvedDefaults, field);
            setDrafts((current) => [...current, { field, value: initialValue }]);
            setNewField('');
          }}
        >
          <div className="cl-ruleset__add">
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
            <Button disabled={newField.trim() === ''} type="submit" variant="secondary">
              <FormattedMessage {...messages.rulesetOverridesAddField} />
            </Button>
          </div>
        </Form>

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

        {fieldPolicies !== undefined && (
          <TournamentSummary
            collapseRules
            discipline={{ fieldPolicies, defaults: mergedConfig }}
            headingLevel={2}
            facts={{
              name: settings?.name ?? tournamentAlias,
              region: settings?.region,
              capacity: settings?.capacity,
              checkInClosesAt: settings?.checkInClosesAt,
              publicRegistration: asBoolean(fieldValueAt(mergedConfig, 'registration.publicOpen')),
              requiresCheckIn: asBoolean(
                fieldValueAt(mergedConfig, 'registration.requiresCheckIn'),
              ),
            }}
            sections={['rules']}
          />
        )}

        <UnsavedChangesBar
          changedFields={changedKeys.map((field) => {
            const policy = resolvedFieldPolicies[field];
            return {
              id: field,
              label:
                policy !== undefined ? resolveFieldPolicyLabel(field, policy, language) : field,
            };
          })}
          dirty={changedKeys.length > 0}
          fieldsLabel={intl.formatMessage(messages.unsavedChangesFields)}
          onReset={() => {
            setDrafts(toDrafts(overrides));
            setPreview([]);
            setError(undefined);
            setSaved(false);
          }}
          onSave={save}
          resetLabel={intl.formatMessage(messages.unsavedChangesReset)}
          saveDisabled={busy || blockedField !== undefined}
          saveLabel={intl.formatMessage(messages.unsavedChangesSave)}
          summary={intl.formatMessage(messages.unsavedChangesSummary, {
            count: changedKeys.length,
          })}
        />
      </div>
    </PageHeaderTemplate>
  );
}
