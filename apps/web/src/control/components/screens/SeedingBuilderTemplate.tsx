import { useState } from 'react';
import { Alert } from '../ui/atoms/alert.js';
import { FormattedMessage, useIntl } from 'react-intl';
import { BracketCanvas } from '../BracketCanvas.js';
import { Button } from '../ui/atoms/button.js';
import type { CanvasMatch } from '../../lib/bracket-canvas.js';
import { canRedo, canUndo, initHistory, push, redo, undo } from '../../lib/history.js';
import { isDirty, randomizeUnlocked, toggleLock, type SeedAssignment } from '../../lib/seeding.js';
import { mutationFeedback } from '../../lib/mutation-feedback.js';
import { messages } from '../../i18n/messages.en.js';
import { ListScreenLayout } from '../ui/layouts/list-screen-layout.js';

/**
 * A6 — seed assignment beside the bracket it produces.
 *
 * Two panes because they answer different questions: the list is what the
 * operator changes, the canvas is what the change means. Locks live on the
 * list; the canvas is read-only, because bracket shape is engine-derived and
 * dragging a match somewhere else would be editing a picture of the truth.
 */
/** One zone's own independent bracket — see `SeedingResponse.zones` (openspec 0246). */
export interface SeedingCanvasZone {
  readonly zoneId?: string;
  readonly zoneName?: string;
  readonly matches: readonly CanvasMatch[];
}

export function SeedingBuilderTemplate({
  organizationAlias,
  tournamentAlias,
  tournamentName,
  seeds,
  zones,
  names = {},
  hasRecordedResults,
  onPublish,
  random,
}: {
  readonly organizationAlias: string;
  /**
   * The URL alias, used to build the bracket canvas's per-node console link.
   * Absent from `matchUrl` (rather than reusing `tournamentName`) so a display
   * name that happens to differ from the alias never leaks into a route.
   */
  readonly tournamentAlias?: string;
  readonly tournamentName: string;
  readonly seeds: readonly SeedAssignment[];
  /**
   * One entry per zone the stage's fixtures already declare — always exactly one entry, with no
   * `zoneId`/`zoneName`, for an un-zoned stage (openspec 0246).
   */
  readonly zones: readonly SeedingCanvasZone[];
  readonly names?: Readonly<Record<string, string>>;
  readonly hasRecordedResults: boolean;
  readonly onPublish?: (seeds: readonly SeedAssignment[]) => Promise<void> | void;
  readonly random?: () => number;
}): React.JSX.Element {
  const intl = useIntl();
  const [history, setHistory] = useState(() => initHistory<readonly SeedAssignment[]>(seeds));
  const [zoom, setZoom] = useState(1);
  const [highlightEntrantId, setHighlightEntrantId] = useState<string>();
  const current = history.present;

  // A courtesy, not the authority: the API classifies the same change and
  // refuses it there. This only spares the operator a round-trip.
  const feedback = mutationFeedback({ mutationClass: 'blocked_after_results', hasRecordedResults });
  const blocked = feedback.kind === 'blocked';

  const apply = (next: readonly SeedAssignment[]): void => setHistory((state) => push(state, next));

  const breadcrumbNode = (
    <span>
      {organizationAlias} &gt; {tournamentName}
    </span>
  );

  const titleNode = <FormattedMessage {...messages.seedingTitle} />;

  const toolbarNode = (
    <div className="cl-role-user">
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

  const listingNode = (
    <div className="cl-screen-sections">
      {blocked && feedback.kind === 'blocked' && (
        <Alert tone="destructive">{intl.formatMessage(feedback.descriptor, feedback.values)}</Alert>
      )}

      <div className="cl-platform-form-grid">
        <div className="cl-card cl-chamfer cl-chamfer--control">
          <header className="cl-card__header">
            <h2 className="cl-card__title">
              <FormattedMessage {...messages.seedingOrder} />
            </h2>
          </header>
          <div className="cl-card__content">
            <ol aria-label={intl.formatMessage(messages.seedingOrder)}>
              {current.map((assignment) => (
                <li key={assignment.seed} className="cl-role-user">
                  <span className="cl-label">{assignment.seed}</span>
                  <span>{names[assignment.entrantId] ?? assignment.entrantId}</span>
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
              ))}
            </ol>
            {current.length === 0 && (
              <p className="cl-card__description">
                <FormattedMessage {...messages.seedingNoParticipants} />
              </p>
            )}
          </div>
        </div>

        <div className="cl-card cl-chamfer cl-chamfer--control">
          <header className="cl-card__header">
            <h2 className="cl-card__title">
              <FormattedMessage {...messages.seedingGeneratedBracket} />
            </h2>
          </header>
          <div className="cl-card__content">
            {/* At least one canvas always renders, even for a not-yet-generated stage, so
                `BracketCanvas`'s own "no structure yet" empty state still shows. */}
            {(zones.length > 0 ? zones : [{ matches: [] as readonly CanvasMatch[] }]).map(
              (zone, index) => (
                <div key={('zoneId' in zone && zone.zoneId) || index}>
                  {zones.length > 1 && 'zoneName' in zone && <h3>{zone.zoneName}</h3>}
                  <BracketCanvas
                    matches={zone.matches}
                    highlightEntrantId={highlightEntrantId}
                    onHighlightEntrant={setHighlightEntrantId}
                    names={names}
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
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <ListScreenLayout
      breadcrumb={breadcrumbNode}
      listing={listingNode}
      title={titleNode}
      toolbar={toolbarNode}
    />
  );
}
