/**
 * Translates a tournament's own configuration — name, stages, registration
 * settings, and its effective ruleset — into plain language, composed above
 * the discipline's own plain-language summary (openspec 0263/0267).
 *
 * Composition, not inheritance: `DisciplineSummary` stays discipline-only
 * (unmodified, still used directly by `DescriptorBuilderWizard`'s
 * discipline-draft preview, which has no tournament to summarize) — this
 * organism only adds the tournament-facts block around it.
 */
import { FormattedMessage, useIntl } from 'react-intl';
import { Card, CardContent, CardHeader, CardTitle } from '../atoms/card.js';
import { Stack } from '../atoms/layout/stack.js';
import { messages } from '../../../i18n/messages.en.js';
import { DisciplineSummary, type DisciplineSummarySection } from './discipline-summary.js';
import type { DisciplineSummaryData } from '../../../lib/discipline-summary.js';

export interface TournamentSummaryStage {
  readonly name: string;
  readonly format: string;
}

/**
 * The tournament-level facts a summary renders — everything not already
 * covered by `DisciplineSummaryData`. Every field but `name` is optional so
 * a reuse site missing one fact (e.g. neither post-creation page fetches
 * stage data today) degrades to omitting that line, never inventing a
 * placeholder value.
 */
export interface TournamentSummaryFacts {
  readonly name: string;
  readonly stages?: readonly TournamentSummaryStage[];
  readonly publicRegistration?: boolean;
  readonly requiresCheckIn?: boolean;
  readonly checkInClosesAt?: string;
  readonly region?: string;
  readonly capacity?: number;
}

export interface TournamentSummaryProps {
  readonly facts: TournamentSummaryFacts;
  readonly discipline: DisciplineSummaryData;
  /** Forwarded to `DisciplineSummary`; defaults to every section. */
  readonly sections?: readonly DisciplineSummarySection[];
  readonly className?: string;
}

export function TournamentSummary({
  facts,
  discipline,
  sections,
  className = '',
}: TournamentSummaryProps): React.JSX.Element {
  const intl = useIntl();

  return (
    <Stack className={`cl-tournament-summary ${className}`.trim()} gap="4">
      <Card>
        <CardHeader>
          <CardTitle>
            {intl.formatMessage(messages.tournamentSummaryFactsHeading, { name: facts.name })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Stack gap="2">
            {facts.stages !== undefined && facts.stages.length > 0 && (
              <div>
                <p style={{ fontWeight: 'var(--cl-weight-bold)' }}>
                  <FormattedMessage {...messages.tournamentSummaryStagesHeading} />
                </p>
                <Stack gap="1">
                  {facts.stages.map((stage, index) => (
                    <p key={`${stage.name}-${index}`}>
                      {intl.formatMessage(messages.tournamentSummaryStageLine, {
                        name: stage.name,
                        format: stage.format,
                      })}
                    </p>
                  ))}
                </Stack>
              </div>
            )}

            {facts.publicRegistration !== undefined && (
              <p>
                {intl.formatMessage(
                  facts.publicRegistration
                    ? messages.tournamentSummaryPublicRegistrationOpen
                    : messages.tournamentSummaryPublicRegistrationClosed,
                )}
              </p>
            )}
            {facts.requiresCheckIn !== undefined && (
              <p>
                {intl.formatMessage(
                  facts.requiresCheckIn
                    ? messages.tournamentSummaryCheckInRequired
                    : messages.tournamentSummaryCheckInNotRequired,
                )}
              </p>
            )}
            {facts.requiresCheckIn === true && facts.checkInClosesAt !== undefined && (
              <p>
                {intl.formatMessage(messages.tournamentSummaryCheckInClosesAt, {
                  closesAt: facts.checkInClosesAt,
                })}
              </p>
            )}
            {facts.region !== undefined && (
              <p>
                {intl.formatMessage(messages.tournamentSummaryRegion, { region: facts.region })}
              </p>
            )}
            {facts.capacity !== undefined && (
              <p>
                {intl.formatMessage(messages.tournamentSummaryCapacity, {
                  capacity: facts.capacity,
                })}
              </p>
            )}
          </Stack>
        </CardContent>
      </Card>

      <DisciplineSummary data={discipline} sections={sections} />
    </Stack>
  );
}
