/**
 * Translates a discipline's segments, rules, and events into plain language,
 * in place of the raw JSON document those three ever showed before
 * (openspec 0263). Presentation only — no fetching, so every consumer (the
 * authoring wizard's review step, the ruleset override editor's explanatory
 * context, and the installed-discipline detail view) feeds it data it
 * already holds.
 *
 * Discipline-agnostic by construction: every sentence is templated from
 * already-declarative fields (`SegmentTypeDefinition`, `FieldPolicy`,
 * `EventDefinition.effects`/`actorRequirement`) — no discipline name, event
 * code, or stat code is ever branched on here.
 */
import { useIntl } from 'react-intl';
import { Badge } from '../atoms/badge.js';
import { Card, CardContent, CardHeader, CardTitle } from '../atoms/card.js';
import { Inline } from '../atoms/layout/inline.js';
import { Stack } from '../atoms/layout/stack.js';
import { DecisionHint } from '../atoms/decision-hint.js';
import { messages } from '../../../i18n/messages.en.js';
import { localizedText } from '../../../lib/table-projections.js';
import { reversibilityMessageKey } from '../../../lib/wizard.js';
import {
  eventActorMessageKey,
  eventAffectsResult,
  formatFieldValue,
  formatSegmentDuration,
  ruleFieldSummaries,
  type DisciplineSummaryData,
} from '../../../lib/discipline-summary.js';
import { isSupportedLanguage, resolveFieldPolicyLabel } from '@copalibre/domain';

export type { DisciplineSummaryData } from '../../../lib/discipline-summary.js';

export type DisciplineSummarySection = 'segments' | 'rules' | 'events';

const ALL_SECTIONS: readonly DisciplineSummarySection[] = ['segments', 'rules', 'events'];

export interface DisciplineSummaryProps {
  readonly data: DisciplineSummaryData;
  /**
   * Which sections to render, in order. Defaults to all three. The ruleset
   * override editor, which only ever has rule data, passes `['rules']`
   * rather than this component inventing empty segment/event placeholders.
   */
  readonly sections?: readonly DisciplineSummarySection[];
  readonly className?: string;
}

const EVENT_ACTOR_MESSAGE = {
  side: messages.disciplineSummaryEventActorSide,
  person: messages.disciplineSummaryEventActorPerson,
  personOrStaff: messages.disciplineSummaryEventActorPersonOrStaff,
  none: messages.disciplineSummaryEventActorNone,
} as const;

const PERMISSION_MESSAGE = {
  inherited: messages.disciplineSummaryPermissionInherited,
  replaced: messages.disciplineSummaryPermissionReplaced,
  merged: messages.disciplineSummaryPermissionMerged,
  forbidden: messages.disciplineSummaryPermissionForbidden,
} as const;

export function DisciplineSummary({
  data,
  sections = ALL_SECTIONS,
  className = '',
}: DisciplineSummaryProps): React.JSX.Element {
  const intl = useIntl();
  const rules = ruleFieldSummaries(data);
  const segmentTypes = data.segmentTypes ?? [];
  const eventDefinitions = data.eventDefinitions ?? [];
  const shortLocale = intl.locale.split('-')[0];
  const language = isSupportedLanguage(shortLocale) ? shortLocale : 'en';

  return (
    <Stack className={`cl-discipline-summary ${className}`.trim()} gap="4">
      {sections.includes('segments') && (
        <Card>
          <CardHeader>
            <CardTitle>{intl.formatMessage(messages.disciplineSummarySegmentsHeading)}</CardTitle>
          </CardHeader>
          <CardContent>
            {segmentTypes.length === 0 ? (
              <p>{intl.formatMessage(messages.disciplineSummaryNoSegments)}</p>
            ) : (
              <Stack gap="2">
                {segmentTypes.map((segment) => {
                  const name = localizedText(segment.label, intl.locale);
                  return (
                    <p key={segment.name}>
                      {segment.timed
                        ? intl.formatMessage(messages.disciplineSummarySegmentTimed, {
                            name,
                            duration:
                              segment.defaultDurationSeconds === undefined
                                ? '—'
                                : formatSegmentDuration(segment.defaultDurationSeconds),
                          })
                        : intl.formatMessage(messages.disciplineSummarySegmentUntimed, { name })}
                    </p>
                  );
                })}
              </Stack>
            )}
          </CardContent>
        </Card>
      )}

      {sections.includes('rules') && (
        <Card>
          <CardHeader>
            <CardTitle>{intl.formatMessage(messages.disciplineSummaryRulesHeading)}</CardTitle>
          </CardHeader>
          <CardContent>
            {rules.length === 0 ? (
              <p>{intl.formatMessage(messages.disciplineSummaryNoRules)}</p>
            ) : (
              <Stack gap="3">
                {rules.map((rule) => {
                  const label = resolveFieldPolicyLabel(rule.dotPath, rule.policy, language);
                  const description =
                    rule.policy.description === undefined
                      ? undefined
                      : localizedText(rule.policy.description, intl.locale);
                  const reversibilityKey = reversibilityMessageKey(rule.policy.mutationClass);
                  const reversibility =
                    reversibilityKey === 'requiresRebuild'
                      ? intl.formatMessage(messages.wizardMutationRequiresRebuild)
                      : reversibilityKey === 'blockedAfterResults'
                        ? intl.formatMessage(messages.wizardMutationBlockedAfterResults)
                        : undefined;
                  return (
                    <div key={rule.dotPath}>
                      <p style={{ fontWeight: 'var(--cl-weight-bold)' }}>{label}</p>
                      <DecisionHint
                        id={`discipline-summary-rule-${rule.dotPath}`}
                        text={description}
                      />
                      <p>{intl.formatMessage(PERMISSION_MESSAGE[rule.policy.permission.kind])}</p>
                      {reversibility !== undefined && <p>{reversibility}</p>}
                      <p>
                        {intl.formatMessage(messages.disciplineSummaryRuleCurrentValue, {
                          value: formatFieldValue(rule.value, intl),
                        })}
                      </p>
                    </div>
                  );
                })}
              </Stack>
            )}
          </CardContent>
        </Card>
      )}

      {sections.includes('events') && (
        <Card>
          <CardHeader>
            <CardTitle>{intl.formatMessage(messages.disciplineSummaryEventsHeading)}</CardTitle>
          </CardHeader>
          <CardContent>
            {eventDefinitions.length === 0 ? (
              <p>{intl.formatMessage(messages.disciplineSummaryNoEvents)}</p>
            ) : (
              <Stack gap="3">
                {eventDefinitions.map((event) => {
                  const name = localizedText(event.label, intl.locale);
                  const description =
                    event.description === undefined
                      ? undefined
                      : localizedText(event.description, intl.locale);
                  const affectsResult = eventAffectsResult(event);
                  return (
                    <div key={event.code}>
                      <Inline align="center" gap="2">
                        <p style={{ fontWeight: 'var(--cl-weight-bold)' }}>{name}</p>
                        {affectsResult && (
                          <Badge
                            label={intl.formatMessage(messages.disciplineSummaryEventAffectsResult)}
                          />
                        )}
                      </Inline>
                      <DecisionHint
                        id={`discipline-summary-event-${event.code}`}
                        text={description}
                      />
                      <p>{intl.formatMessage(EVENT_ACTOR_MESSAGE[eventActorMessageKey(event)])}</p>
                    </div>
                  );
                })}
              </Stack>
            )}
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
