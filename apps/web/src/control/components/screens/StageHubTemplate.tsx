import { useState } from 'react';
import { Alert } from '../ui/atoms/alert.js';
import { FormattedMessage, useIntl } from 'react-intl';
import { isSupportedLanguage, resolveLabel, type LocalizedLabel } from '@copalibre/domain';
import { controlLinkClick } from '../../lib/control-navigation.js';
import { Button } from '../ui/atoms/button.js';
import { Card } from '../ui/atoms/card.js';
import { Input } from '../ui/atoms/input.js';
import { Select } from '../ui/atoms/select.js';
import { DecisionHint } from '../ui/atoms/decision-hint.js';
import { Field } from '../ui/molecules/field.js';
import { messages } from '../../i18n/messages.en.js';
import { resolveDecisionDescription } from '../../lib/wizard.js';
import { ListScreenLayout } from '../ui/layouts/list-screen-layout.js';

/**
 * Rename/format-change/delete for the stage this hub is on — relocated from
 * `SeedingBuilderPage.tsx`'s `StageSettingsSection` (openspec 0250, design.md
 * - "Relocation, not duplication"). The rename field now starts from the
 * stage's real current name instead of always blank, since `StageHubPage`
 * only mounts this once that name has actually loaded. The format field is a
 * guided `Select` sourced the same way `StageListEditor.tsx`'s is, with a
 * `DecisionHint` resolving the selected format's own declared description —
 * the first real caller of `formatDescriptions` anywhere in control-web
 * (openspec 0251, design.md - "Stage hub format field").
 */
function StageIdentitySection({
  currentName,
  currentFormat,
  availableFormats,
  formatDescriptions,
  seeded,
  onRename,
  onChangeFormat,
  onDelete,
}: {
  readonly currentName: string;
  readonly currentFormat: string;
  readonly availableFormats: readonly string[];
  readonly formatDescriptions?: Readonly<Record<string, string | LocalizedLabel>>;
  readonly seeded: boolean;
  readonly onRename: (name: string) => Promise<void>;
  readonly onChangeFormat: (format: string) => Promise<void>;
  readonly onDelete: () => Promise<void>;
}): React.JSX.Element {
  const intl = useIntl();
  const [name, setName] = useState(currentName);
  const [format, setFormat] = useState(currentFormat);
  const language = isSupportedLanguage(intl.locale) ? intl.locale : 'en';
  const formatDescriptionValue = formatDescriptions?.[format];
  const formatHintText = resolveDecisionDescription(
    formatDescriptionValue === undefined
      ? undefined
      : resolveLabel(formatDescriptionValue, language),
    undefined,
  );
  // The current format may not appear in the discipline's own declared list
  // (e.g. a module downgrade after this stage was created) — offered anyway
  // so the operator's existing selection is never silently dropped.
  const formatOptions = availableFormats.includes(format)
    ? availableFormats
    : [format, ...availableFormats];

  return (
    <Card
      aria-label={intl.formatMessage(messages.stageSettingsTitle)}
      className="cl-chamfer cl-chamfer--control"
    >
      <header className="cl-card__header">
        <h2 className="cl-card__title">
          <FormattedMessage {...messages.stageSettingsTitle} />
        </h2>
      </header>
      <div className="cl-card__content">
        <Field id="stage-rename" label={intl.formatMessage(messages.stageRenameLabel)}>
          <Input id="stage-rename" onChange={(event) => setName(event.target.value)} value={name} />
        </Field>
        <Button
          disabled={name.trim() === ''}
          onClick={() => void onRename(name)}
          type="button"
          variant="secondary"
        >
          <FormattedMessage {...messages.stageRenameSubmit} />
        </Button>

        <Field id="stage-format" label={intl.formatMessage(messages.stageFormatLabel)}>
          <Select
            aria-describedby={formatHintText === undefined ? undefined : 'stage-format-hint'}
            disabled={seeded}
            id="stage-format"
            onValueChange={setFormat}
            options={formatOptions.map((value) => ({ value, label: value }))}
            value={format}
          />
        </Field>
        {formatHintText !== undefined && (
          <DecisionHint id="stage-format-hint" text={formatHintText} />
        )}
        <Button
          disabled={seeded || format.trim() === ''}
          onClick={() => void onChangeFormat(format)}
          type="button"
          variant="secondary"
        >
          <FormattedMessage {...messages.stageFormatSubmit} />
        </Button>

        <Button
          disabled={seeded}
          onClick={() => void onDelete()}
          type="button"
          variant="destructive-outline"
        >
          <FormattedMessage {...messages.stageDelete} />
        </Button>
        {seeded && (
          <Alert tone="info">
            <FormattedMessage {...messages.stageSeededExplanation} />
          </Alert>
        )}
      </div>
    </Card>
  );
}

/**
 * The Stage hub (openspec 0250): identity (above) plus a doorway to that same
 * stage's existing seeding, zones-and-groups, standings and schedule tools —
 * each of which links back here (task 6).
 */
export function StageHubTemplate({
  organizationAlias,
  tournamentAlias,
  stageNumber,
  stageName,
  stageFormat,
  availableFormats,
  formatDescriptions,
  seeded,
  onRename,
  onChangeFormat,
  onDelete,
}: {
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
  readonly stageNumber: number;
  readonly stageName: string;
  readonly stageFormat: string;
  readonly availableFormats: readonly string[];
  readonly formatDescriptions?: Readonly<Record<string, string | LocalizedLabel>>;
  readonly seeded: boolean;
  readonly onRename: (name: string) => Promise<void>;
  readonly onChangeFormat: (format: string) => Promise<void>;
  readonly onDelete: () => Promise<void>;
}): React.JSX.Element {
  const intl = useIntl();
  const base = `/control/${organizationAlias}/tournaments/${tournamentAlias}/stages/${stageNumber}`;

  const breadcrumbNode = (
    <span>
      {organizationAlias} / {tournamentAlias}
    </span>
  );

  const titleNode = (
    <FormattedMessage {...messages.stageHubTitle} values={{ number: stageNumber }} />
  );

  const tools: readonly { readonly href: string; readonly label: string }[] = [
    { href: `${base}/seeding`, label: intl.formatMessage(messages.stageHubSeedingLink) },
    { href: `${base}/zones`, label: intl.formatMessage(messages.stageHubZoneGroupsLink) },
    { href: `${base}/standings`, label: intl.formatMessage(messages.stageHubStandingsLink) },
    { href: `${base}/schedule`, label: intl.formatMessage(messages.stageHubScheduleLink) },
  ];

  const listingNode = (
    <div className="cl-screen-sections">
      <StageIdentitySection
        availableFormats={availableFormats}
        currentFormat={stageFormat}
        currentName={stageName}
        formatDescriptions={formatDescriptions}
        onChangeFormat={onChangeFormat}
        onDelete={onDelete}
        onRename={onRename}
        seeded={seeded}
      />
      <Card
        aria-label={intl.formatMessage(messages.stageHubToolsHeading)}
        className="cl-chamfer cl-chamfer--control"
      >
        <header className="cl-card__header">
          <h2 className="cl-card__title">
            <FormattedMessage {...messages.stageHubToolsHeading} />
          </h2>
        </header>
        <div className="cl-card__content">
          <ul>
            {tools.map((tool) => (
              <li key={tool.href} className="cl-role-user">
                <a className="cl-focusable" href={tool.href} onClick={controlLinkClick(tool.href)}>
                  {tool.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </div>
  );

  return <ListScreenLayout breadcrumb={breadcrumbNode} listing={listingNode} title={titleNode} />;
}
