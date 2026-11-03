import { useState } from 'react';
import { Alert } from '../ui/atoms/alert.js';
import { FormattedMessage, useIntl } from 'react-intl';
import { BracketCanvas } from '../BracketCanvas.js';
import { Button } from '../ui/atoms/button.js';
import { controlLinkClick } from '../../lib/control-navigation.js';
import type { CanvasMatch } from '../../lib/bracket-canvas.js';
import { canRedo, canUndo, initHistory, push, redo, undo } from '../../lib/history.js';
import { isDirty, randomizeUnlocked, toggleLock, type SeedAssignment } from '../../lib/seeding.js';
import { mutationFeedback } from '../../lib/mutation-feedback.js';
import { messages } from '../../i18n/messages.en.js';
import { WorkspaceTemplate } from './WorkspaceTemplate.js';
import { Input } from '../ui/atoms/input.js';
import { SectionTabList } from '../ui/organisms/section-tabs.js';
import { GenerateAheadPanel } from '../ui/organisms/generate-ahead-panel.js';
import type { SeedingQualifierZoneResponse } from '../../lib/api-client.js';
import { aheadPreviewMatches } from '../../lib/generate-ahead.js';
import { formatEntrant } from '../../lib/presentation-formatting.js';

function resolveEntrantDisplayName(
  entrantId: string,
  names: Readonly<Record<string, string>>,
  intl: ReturnType<typeof useIntl>,
): string {
  return formatEntrant(intl, { displayName: names[entrantId] }).fullName;
}

/**
 * A6 — seed assignment beside the bracket it produces.
 *
 * Two panes because they answer different questions: the list is what the
 * operator changes, the canvas is what the change means. Locks live on the
 * list; the canvas is read-only, because bracket shape is engine-derived and
 * dragging a match somewhere else would be editing a picture of the truth.
 */
/** One zone's own independent bracket — see `SeedingResponse.zones`. */
export interface SeedingCanvasZone {
  readonly zoneId?: string;
  readonly zoneName?: string;
  readonly matches: readonly CanvasMatch[];
}

export function SeedingBuilderTemplate({
  organizationAlias,
  tournamentAlias,
  tournamentName,
  stageNumber,
  seeds,
  zones,
  names = {},
  hasRecordedResults,
  onPublish,
  random,
  configurationSection,
  ahead,
}: {
  readonly organizationAlias: string;
  /**
   * The URL alias, used to build the bracket canvas's per-node console link.
   * Absent from `matchUrl` (rather than reusing `tournamentName`) so a display
   * name that happens to differ from the alias never leaks into a route.
   */
  readonly tournamentAlias?: string;
  readonly tournamentName?: string;
  /** Present when the caller knows it — used only to link the breadcrumb back to the stage hub. */
  readonly stageNumber?: number;
  readonly seeds: readonly SeedAssignment[];
  /**
   * One entry per zone the stage's fixtures already declare — always exactly one entry, with no
   * `zoneId`/`zoneName`, for an un-zoned stage.
   */
  readonly zones: readonly SeedingCanvasZone[];
  readonly names?: Readonly<Record<string, string>>;
  readonly hasRecordedResults: boolean;
  readonly onPublish?: (seeds: readonly SeedAssignment[]) => Promise<void> | void;
  readonly random?: () => number;
  readonly configurationSection?: React.ReactNode;
  /**
   * Present when promotion plans route qualifiers to this stage: the stage can then be generated
   * ahead of its prior stage, with qualifier positions instead of entrants.
   */
  readonly ahead?: {
    readonly zones: readonly SeedingQualifierZoneResponse[];
    readonly generated: boolean;
    readonly onGenerate?: () => Promise<void> | void;
  };
}): React.JSX.Element {
  const intl = useIntl();
  const [history, setHistory] = useState(() => initHistory<readonly SeedAssignment[]>(seeds));
  const [zoom, setZoom] = useState(1);
  const [highlightEntrantId, setHighlightEntrantId] = useState<string>();
  const [seedFilter, setSeedFilter] = useState('');
  const [activeZoneIndex, setActiveZoneIndex] = useState(0);
  const current = history.present;

  // A courtesy, not the authority: the API classifies the same change and
  // refuses it there. This only spares the operator a round-trip.
  const feedback = mutationFeedback({ mutationClass: 'blocked_after_results', hasRecordedResults });
  const blocked = feedback.kind === 'blocked';

  const apply = (next: readonly SeedAssignment[]): void => setHistory((state) => push(state, next));

  const stageHubHref =
    tournamentAlias !== undefined && stageNumber !== undefined
      ? `/control/${organizationAlias}/tournaments/${tournamentAlias}/stages/${stageNumber}`
      : undefined;
  const breadcrumbs = [
    ...(tournamentName?.trim() && tournamentAlias !== undefined
      ? [
          {
            label: tournamentName.trim(),
            href: `/control/${organizationAlias}/tournaments/${tournamentAlias}`,
          },
        ]
      : []),
    ...(stageHubHref !== undefined
      ? [
          {
            label: intl.formatMessage(messages.stageHubBreadcrumbLink, { stageNumber }),
            href: stageHubHref,
          },
        ]
      : []),
  ];

  const titleNode = <FormattedMessage {...messages.seedingTitle} />;

  const actionsNode = (
    <div className="cl-tournament-settings__header-actions">
      <Button
        disabled={!canUndo(history)}
        onClick={() => setHistory(undo)}
        type="button"
        variant="secondary"
      >
        <FormattedMessage {...messages.seedingUndo} />
      </Button>
      <Button
        disabled={!canRedo(history)}
        onClick={() => setHistory(redo)}
        type="button"
        variant="secondary"
      >
        <FormattedMessage {...messages.seedingRedo} />
      </Button>
      <Button
        disabled={blocked}
        onClick={() => apply(randomizeUnlocked(current, random))}
        type="button"
        variant="secondary"
      >
        <FormattedMessage {...messages.seedingRandomizeUnlocked} />
      </Button>
      <Button
        disabled={blocked || !isDirty(current, seeds)}
        onClick={() => void onPublish?.(current)}
        type="button"
      >
        <FormattedMessage {...messages.seedingPublish} />
      </Button>
    </div>
  );

  const normalizedFilter = seedFilter.trim().toLocaleLowerCase();
  const visibleSeeds = current.filter(
    (assignment) =>
      normalizedFilter === '' ||
      resolveEntrantDisplayName(assignment.entrantId, names, intl)
        .toLocaleLowerCase()
        .includes(normalizedFilter),
  );

  const seedPane = (
    <div className="cl-seeding__list">
      <h2>
        <FormattedMessage {...messages.seedingOrder} />
      </h2>
      {blocked && feedback.kind === 'blocked' && (
        <Alert tone="destructive">{intl.formatMessage(feedback.descriptor, feedback.values)}</Alert>
      )}
      {current.length > 0 && (
        <Input
          aria-label={intl.formatMessage(messages.seedingFilter)}
          onChange={(event) => setSeedFilter(event.target.value)}
          placeholder={intl.formatMessage(messages.seedingFilter)}
          type="search"
          value={seedFilter}
        />
      )}
      <ol aria-label={intl.formatMessage(messages.seedingOrder)} className="cl-seeding__seeds">
        {visibleSeeds.map((assignment) => {
          const displayName = resolveEntrantDisplayName(assignment.entrantId, names, intl);
          return (
            <li className="cl-seeding__seed" key={assignment.seed}>
              <span className="cl-seeding__seed-tag">{assignment.seed}</span>
              <span className="cl-seeding__seed-name">{displayName}</span>
              <Button
                aria-label={intl.formatMessage(messages.seedingToggleLockAriaLabel, {
                  locked: assignment.locked,
                  seed: assignment.seed,
                })}
                aria-pressed={assignment.locked}
                disabled={blocked}
                onClick={() => apply(toggleLock(current, assignment.seed))}
                type="button"
                variant="secondary"
              >
                <FormattedMessage
                  {...(assignment.locked ? messages.seedingLocked : messages.seedingUnlocked)}
                />
              </Button>
            </li>
          );
        })}
      </ol>
      {current.length === 0 && (
        <p className="cl-card__description">
          <FormattedMessage {...messages.seedingNoParticipants} />
        </p>
      )}
    </div>
  );

  const canvasZones = zones.length > 0 ? zones : [{ matches: [] as readonly CanvasMatch[] }];
  const shownZoneIndex = Math.min(activeZoneIndex, canvasZones.length - 1);
  const canvasPane = (
    <div className="cl-seeding__canvas">
      <h2>
        <FormattedMessage {...messages.seedingGeneratedBracket} />
      </h2>
      {canvasZones.length > 1 && (
        <SectionTabList
          ariaLabel={intl.formatMessage(messages.zoneGroupSelectZone)}
          currentTabId={String(shownZoneIndex)}
          idPrefix="seeding-zone"
          onSelect={(id) => setActiveZoneIndex(Number(id))}
          tabs={canvasZones.map((zone, index) => ({
            id: String(index),
            label: ('zoneName' in zone && zone.zoneName) || String(index + 1),
          }))}
        />
      )}
      {/* At least one canvas always renders, even for a not-yet-generated stage, so
          `BracketCanvas`'s own "no structure yet" empty state still shows. */}
      {canvasZones.map((zone, index) => (
        <div
          aria-labelledby={canvasZones.length > 1 ? `seeding-zone-${index}-tab` : undefined}
          hidden={index !== shownZoneIndex}
          id={`seeding-zone-${index}-panel`}
          key={('zoneId' in zone && zone.zoneId) || index}
          role={canvasZones.length > 1 ? 'tabpanel' : undefined}
        >
          <BracketCanvas
            matches={zone.matches}
            highlightEntrantId={highlightEntrantId}
            onHighlightEntrant={setHighlightEntrantId}
            names={names}
            organizationAlias={organizationAlias}
            matchUrl={
              tournamentAlias === undefined
                ? undefined
                : (persistedMatchId) =>
                    `/control/${organizationAlias}/tournaments/${tournamentAlias}/matches/${persistedMatchId}`
            }
            onZoomChange={setZoom}
            zoom={zoom}
          />
        </div>
      ))}

      {ahead !== undefined && (
        <GenerateAheadPanel
          confirmHref={
            tournamentAlias === undefined || stageNumber === undefined
              ? undefined
              : `/control/${organizationAlias}/tournaments/${tournamentAlias}/stages/${stageNumber}/qualification`
          }
          confirmLabel={intl.formatMessage(messages.seedingAheadConfirmLink)}
          description={intl.formatMessage(messages.seedingAheadDescription)}
          disabled={hasRecordedResults}
          generateLabel={intl.formatMessage(messages.seedingAheadGenerate)}
          generated={ahead.generated}
          generatedMessage={intl.formatMessage(messages.seedingAheadGenerated)}
          onGenerate={ahead.onGenerate}
          previewHeading={intl.formatMessage(messages.seedingAheadPreview)}
          title={intl.formatMessage(messages.seedingAheadTitle)}
        >
          {ahead.zones.map((zone, index) => (
            <div key={zone.zoneId ?? index}>
              {ahead.zones.length > 1 && zone.zoneName !== undefined && <h4>{zone.zoneName}</h4>}
              <BracketCanvas
                matches={aheadPreviewMatches(zone)}
                onZoomChange={setZoom}
                zoom={zoom}
              />
            </div>
          ))}
        </GenerateAheadPanel>
      )}

      {configurationSection}

      {stageNumber !== undefined && tournamentAlias !== undefined && (
        <div>
          <a
            className="cl-focusable"
            href={`/control/${organizationAlias}/tournaments/${tournamentAlias}/stages/${stageNumber}/zones`}
            onClick={controlLinkClick(
              `/control/${organizationAlias}/tournaments/${tournamentAlias}/stages/${stageNumber}/zones`,
            )}
          >
            <FormattedMessage {...messages.stageHubZoneGroupsLink} />
          </a>
        </div>
      )}
    </div>
  );

  return (
    <WorkspaceTemplate
      actions={actionsNode}
      breadcrumbs={breadcrumbs}
      primaryLabel={intl.formatMessage(messages.seedingOrder)}
      primaryPane={seedPane}
      secondaryLabel={intl.formatMessage(messages.seedingTitle)}
      secondaryPane={canvasPane}
      split="media-form"
      title={titleNode}
    />
  );
}
