import { useState } from 'react';
import { Alert } from '../ui/atoms/alert.js';
import { FormattedMessage, useIntl } from 'react-intl';
import { controlLinkClick } from '../../lib/control-navigation.js';
import { Button } from '../ui/atoms/button.js';
import { Card } from '../ui/atoms/card.js';
import { Input } from '../ui/atoms/input.js';
import { Field } from '../ui/molecules/field.js';
import { messages } from '../../i18n/messages.en.js';
import { ListScreenLayout } from '../ui/layouts/list-screen-layout.js';

/**
 * Rename/format-change/delete for the stage this hub is on — relocated from
 * `SeedingBuilderPage.tsx`'s `StageSettingsSection` (openspec 0250, design.md
 * - "Relocation, not duplication"). The rename field now starts from the
 * stage's real current name instead of always blank, since `StageHubPage`
 * only mounts this once that name has actually loaded.
 */
function StageIdentitySection({
  currentName,
  currentFormat,
  seeded,
  onRename,
  onChangeFormat,
  onDelete,
}: {
  readonly currentName: string;
  readonly currentFormat: string;
  readonly seeded: boolean;
  readonly onRename: (name: string) => Promise<void>;
  readonly onChangeFormat: (format: string) => Promise<void>;
  readonly onDelete: () => Promise<void>;
}): React.JSX.Element {
  const intl = useIntl();
  const [name, setName] = useState(currentName);
  const [format, setFormat] = useState(currentFormat);

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
          <Input
            disabled={seeded}
            id="stage-format"
            onChange={(event) => setFormat(event.target.value)}
            value={format}
          />
        </Field>
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
        currentFormat={stageFormat}
        currentName={stageName}
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
