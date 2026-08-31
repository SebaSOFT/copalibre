import {
  SUPPORTED_LANGUAGES,
  type LocalizedLabel,
  type SupportedLanguage,
} from '@copalibre/domain';
import type { MessageDescriptor } from 'react-intl';
import { messages } from '../i18n/messages.en.js';
import type { AuthoredModuleRequest } from './api-client.js';

/**
 * The discipline builder wizard (openspec 0164).
 *
 * Produces a plain JSON document matching `DisciplineDescriptorDocument`'s
 * shape — never a typed domain object — because the server is the single
 * validation authority (design.md's "Validation is the domain's, at every
 * step"): this file's job is to compose the document and refuse an
 * incoherent one *before* it is sent, not to re-implement schema validation.
 *
 * Scope cut, deliberate: tags, rosterRoles, tableLayouts, collectors, series
 * and per-field `fieldPolicies` are not authored here. A discipline built by
 * this wizard gets the standard ruleset-override field policies
 * (`format`/`registration.*`) auto-attached — the structural minimum every
 * discipline needs to be usable for tournament creation — never asked as a
 * decision.
 */

export type DescriptorStepId =
  'name' | 'authorship' | 'participants' | 'statistics' | 'formats' | 'winCondition';

export const DESCRIPTOR_STEPS: readonly {
  readonly id: DescriptorStepId;
  readonly label: MessageDescriptor;
}[] = [
  { id: 'name', label: messages.descriptorStepName },
  { id: 'authorship', label: messages.descriptorStepAuthorship },
  { id: 'participants', label: messages.descriptorStepParticipants },
  { id: 'statistics', label: messages.descriptorStepStatistics },
  { id: 'formats', label: messages.descriptorStepFormats },
  { id: 'winCondition', label: messages.descriptorStepWinCondition },
];

export type ParticipantType = 'individual' | 'team';
export type AggregationMode = 'sum' | 'count' | 'max' | 'min' | 'average';
export const AGGREGATION_MODES: readonly AggregationMode[] = [
  'sum',
  'count',
  'max',
  'min',
  'average',
];
export type EventCategory = 'positive' | 'negative' | 'neutral';
export const EVENT_CATEGORIES: readonly EventCategory[] = ['positive', 'negative', 'neutral'];
export type ActorRequirement = 'none' | 'side' | 'person' | 'person-or-staff';
export const ACTOR_REQUIREMENTS: readonly ActorRequirement[] = [
  'none',
  'side',
  'person',
  'person-or-staff',
];
export type ScoringInputSource = 'event-derived' | 'operator-entered';
export const TOURNAMENT_FORMATS: readonly string[] = [
  'single-elimination',
  'double-elimination',
  'round-robin',
  'league',
  'round-robin-single-leg',
  'round-robin-home-away',
  'free-for-all',
  'heats',
];
export type WinConditionMode = 'simple' | 'segmented';

/** English plus any number of the other seven languages, each optional. */
export interface LocalizedDraft {
  readonly en: string;
  readonly translations: Readonly<Partial<Record<SupportedLanguage, string>>>;
}

export function emptyLocalizedDraft(): LocalizedDraft {
  return { en: '', translations: {} };
}

/** Renders a draft to the wire shape: a bare string when no other language was supplied. */
export function localizedValue(draft: LocalizedDraft): string | LocalizedLabel | undefined {
  const en = draft.en.trim();
  if (en === '') return undefined;
  const others = Object.entries(draft.translations).filter(
    ([language, value]) => language !== 'en' && value !== undefined && value.trim() !== '',
  );
  if (others.length === 0) return en;
  return { en, ...Object.fromEntries(others) } as LocalizedLabel;
}

export const TRANSLATABLE_LANGUAGES: readonly SupportedLanguage[] = SUPPORTED_LANGUAGES.filter(
  (language) => language !== 'en',
);

export interface SegmentTypeDraft {
  readonly name: string;
  readonly label: string;
  readonly timed: boolean;
  readonly defaultDurationSeconds?: number;
}

export interface StatisticDraft {
  readonly code: string;
  readonly label: string;
  readonly aggregation: AggregationMode;
}

export interface EventDefinitionDraft {
  readonly code: string;
  readonly label: string;
  readonly category: EventCategory;
  readonly actorRequirement: ActorRequirement;
  readonly permittedSegmentTypes: readonly string[];
  /** The one statistic this event's occurrence awards, if any — task 2.3's "relationship between them". */
  readonly awardsStatisticCode?: string;
  readonly awardsDelta: number;
}

export interface ScoringInputDraft {
  readonly code: string;
  readonly label: string;
  readonly source: ScoringInputSource;
}

export interface DescriptorWizardState {
  readonly step: DescriptorStepId;
  readonly alias: string;
  readonly version: string;
  readonly name: LocalizedDraft;
  readonly description: LocalizedDraft;
  readonly author: string;
  readonly licence: string;
  readonly sourceUrl: string;
  readonly participantTypes: readonly ParticipantType[];
  readonly minPlayers: number;
  readonly maxPlayers: number;
  readonly maxSubstitutes?: number;
  readonly allowMidTournamentChanges: boolean;
  readonly segmentTypes: readonly SegmentTypeDraft[];
  readonly statistics: readonly StatisticDraft[];
  readonly eventDefinitions: readonly EventDefinitionDraft[];
  readonly availableFormats: readonly string[];
  readonly scoringInputs: readonly ScoringInputDraft[];
  readonly winConditionMode: WinConditionMode;
  /** `winMatch`'s `unit` — a statistic code or, in segmented mode, the segment name `winSegment` closed. */
  readonly winMatchUnit: string;
  readonly winMatchTarget?: number;
  readonly segmentName: string;
  readonly segmentTarget?: number;
  readonly segmentMargin?: number;
  readonly tiebreakAt?: number;
  readonly tiebreakTarget?: number;
  readonly tiebreakMargin?: number;
}

export function initialDescriptorWizard(): DescriptorWizardState {
  return {
    step: 'name',
    alias: '',
    version: '0.1.0',
    name: emptyLocalizedDraft(),
    description: emptyLocalizedDraft(),
    author: '',
    licence: 'AGPL-3.0-only',
    sourceUrl: '',
    participantTypes: [],
    minPlayers: 1,
    maxPlayers: 1,
    allowMidTournamentChanges: false,
    segmentTypes: [],
    statistics: [],
    eventDefinitions: [],
    availableFormats: [],
    scoringInputs: [],
    winConditionMode: 'simple',
    winMatchUnit: '',
    segmentName: 'set',
  };
}

const ALIAS_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function nextStep(state: DescriptorWizardState): DescriptorStepId {
  const index = DESCRIPTOR_STEPS.findIndex((step) => step.id === state.step);
  return DESCRIPTOR_STEPS[Math.min(index + 1, DESCRIPTOR_STEPS.length - 1)]?.id ?? state.step;
}

export function previousStep(state: DescriptorWizardState): DescriptorStepId {
  const index = DESCRIPTOR_STEPS.findIndex((step) => step.id === state.step);
  return DESCRIPTOR_STEPS[Math.max(index - 1, 0)]?.id ?? state.step;
}

export function progress(state: DescriptorWizardState): number {
  const index = DESCRIPTOR_STEPS.findIndex((step) => step.id === state.step);
  return Math.round(((index + 1) / DESCRIPTOR_STEPS.length) * 100);
}

/** What is missing on this step — every one refused in the surface, before submission. */
export function stepProblems(state: DescriptorWizardState): readonly MessageDescriptor[] {
  switch (state.step) {
    case 'name':
      return [
        ...(ALIAS_PATTERN.test(state.alias) ? [] : [messages.descriptorProblemAliasFormat]),
        ...(state.version.trim() === '' ? [messages.descriptorProblemVersion] : []),
        ...(state.name.en.trim() === '' ? [messages.descriptorProblemNameEnglish] : []),
      ];
    case 'authorship':
      return [
        ...(state.author.trim() === '' ? [messages.descriptorProblemAuthor] : []),
        ...(state.licence.trim() === '' ? [messages.descriptorProblemLicence] : []),
      ];
    case 'participants':
      return [
        ...(state.participantTypes.length === 0
          ? [messages.descriptorProblemParticipantTypes]
          : []),
        ...(state.minPlayers < 1 || state.maxPlayers < state.minPlayers
          ? [messages.descriptorProblemRosterConstraints]
          : []),
      ];
    case 'statistics': {
      const codes = new Set(state.statistics.map((statistic) => statistic.code));
      return [
        ...(state.statistics.length === 0 ? [messages.descriptorProblemNoStatistics] : []),
        ...(state.eventDefinitions.some(
          (event) =>
            event.awardsStatisticCode !== undefined && !codes.has(event.awardsStatisticCode),
        )
          ? [messages.descriptorProblemEventUndeclaredStatistic]
          : []),
      ];
    }
    case 'formats':
      return state.availableFormats.length === 0 ? [messages.descriptorProblemNoFormats] : [];
    case 'winCondition': {
      const problems: MessageDescriptor[] = [];
      if (state.winMatchUnit.trim() === '')
        problems.push(messages.descriptorProblemWinConditionUnit);
      if (state.winConditionMode === 'segmented') {
        if (state.segmentName.trim() === '') problems.push(messages.descriptorProblemSegmentName);
        if (state.segmentTarget === undefined || state.segmentTarget < 1) {
          problems.push(messages.descriptorProblemSegmentTarget);
        }
        if (!state.segmentTypes.some((segment) => segment.name === state.segmentName)) {
          problems.push(messages.descriptorProblemSegmentUndeclared);
        }
      }
      return problems;
    }
  }
}

export function canContinue(state: DescriptorWizardState): boolean {
  return stepProblems(state).length === 0;
}

export function canSubmit(state: DescriptorWizardState): boolean {
  return DESCRIPTOR_STEPS.every((step) => stepProblems({ ...state, step: step.id }).length === 0);
}

function statisticEffect(
  event: EventDefinitionDraft,
): readonly Record<string, unknown>[] | undefined {
  if (event.awardsStatisticCode === undefined) return undefined;
  return [
    {
      kind: 'statistic',
      statisticCode: event.awardsStatisticCode,
      delta: event.awardsDelta,
      awardTo: 'actor',
    },
  ];
}

function param(id: string, type: 'simple_string' | 'simple_number', value: string | number) {
  return { id, name: id, type, value, options: {} };
}

/**
 * Composes `winCondition` from the three core-owned actions
 * (`requireMargin`/`winSegment`/`winMatch`) — never a fourth, since the
 * vocabulary is core-owned (0163's authoring guide). `simple` mode mirrors
 * football's no-segment shape; `segmented` mirrors tennis's margin-gated,
 * segment-closing shape.
 */
export function buildWinCondition(state: DescriptorWizardState): Record<string, unknown> {
  if (state.winConditionMode === 'simple') {
    return {
      id: 'win-condition',
      rules: [
        {
          id: 'close-match-rule',
          type: 'simple_rule',
          options: {},
          conditions: [],
          actions: [
            {
              id: 'close-match',
              type: 'winMatch',
              options: {},
              params: [
                param('unit', 'simple_string', state.winMatchUnit),
                ...(state.winMatchTarget === undefined
                  ? []
                  : [param('target', 'simple_number', state.winMatchTarget)]),
              ],
            },
          ],
        },
      ],
    };
  }

  return {
    id: 'win-condition',
    rules: [
      {
        id: 'close-segment-rule',
        type: 'simple_rule',
        options: {},
        conditions: [],
        actions: [
          ...(state.segmentMargin === undefined
            ? []
            : [
                {
                  id: 'require-segment-margin',
                  type: 'requireMargin',
                  options: {},
                  params: [param('margin', 'simple_number', state.segmentMargin)],
                },
              ]),
          {
            id: 'close-segment',
            type: 'winSegment',
            options: {},
            params: [
              param('segment', 'simple_string', state.segmentName),
              param('target', 'simple_number', state.segmentTarget ?? 1),
              ...(state.tiebreakAt === undefined
                ? []
                : [param('tiebreakAt', 'simple_number', state.tiebreakAt)]),
              ...(state.tiebreakTarget === undefined
                ? []
                : [param('tiebreakTarget', 'simple_number', state.tiebreakTarget)]),
              ...(state.tiebreakMargin === undefined
                ? []
                : [param('tiebreakMargin', 'simple_number', state.tiebreakMargin)]),
            ],
          },
        ],
      },
      {
        id: 'close-match-rule',
        type: 'simple_rule',
        options: {},
        conditions: [],
        actions: [
          {
            id: 'close-match',
            type: 'winMatch',
            options: {},
            params: [
              param('unit', 'simple_string', state.winMatchUnit),
              ...(state.winMatchTarget === undefined
                ? []
                : [param('target', 'simple_number', state.winMatchTarget)]),
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Every discipline needs these four ruleset-override field policies to be
 * usable for tournament creation at all — `TournamentsController.create`
 * always overrides `format`/`registration.publicOpen`/
 * `registration.requiresCheckIn`/`registration.capacity` — so they are
 * attached structurally, never asked as an authoring decision (the wizard's
 * documented scope cut: no per-field `fieldPolicies` authoring surface).
 */
const STANDARD_FIELD_POLICIES: Record<string, unknown> = {
  format: { permission: { kind: 'replaced' }, mutationClass: 'blocked_after_results' },
  'registration.publicOpen': { permission: { kind: 'replaced' }, mutationClass: 'safe' },
  'registration.requiresCheckIn': {
    permission: { kind: 'replaced' },
    mutationClass: 'requires_rebuild',
  },
  'registration.capacity': { permission: { kind: 'replaced' }, mutationClass: 'requires_rebuild' },
};

/** Builds the authored document — call only once `canSubmit` is true. */
export function toAuthoredDocument(state: DescriptorWizardState): Record<string, unknown> {
  const name = localizedValue(state.name);
  if (name === undefined) throw new Error('The wizard is not complete');
  const description = localizedValue(state.description);

  return {
    alias: state.alias,
    version: state.version,
    name,
    ...(description === undefined ? {} : { description }),
    attribution: {
      author: state.author,
      licence: state.licence,
      ...(state.sourceUrl.trim() === '' ? {} : { sourceUrl: state.sourceUrl.trim() }),
    },
    participantTypes: state.participantTypes,
    rosterConstraints: {
      minPlayers: state.minPlayers,
      maxPlayers: state.maxPlayers,
      ...(state.maxSubstitutes === undefined ? {} : { maxSubstitutes: state.maxSubstitutes }),
      allowMidTournamentChanges: state.allowMidTournamentChanges,
    },
    segmentTypes: state.segmentTypes.map((segment) => ({
      name: segment.name,
      label: segment.label,
      timed: segment.timed,
      ...(segment.defaultDurationSeconds === undefined
        ? {}
        : { defaultDurationSeconds: segment.defaultDurationSeconds }),
    })),
    eventDefinitions: state.eventDefinitions.map((event) => ({
      code: event.code,
      label: event.label,
      category: event.category,
      permittedSegmentTypes: event.permittedSegmentTypes,
      actorRequirement: event.actorRequirement,
      ...(statisticEffect(event) === undefined ? {} : { effects: statisticEffect(event) }),
    })),
    statistics: state.statistics.map((statistic) => ({
      code: statistic.code,
      label: statistic.label,
      aggregation: statistic.aggregation,
    })),
    scoringInputs: state.scoringInputs.map((input) => ({
      code: input.code,
      label: input.label,
      source: input.source,
    })),
    availableFormats: state.availableFormats,
    notificationRuleCapabilities: [],
    winCondition: buildWinCondition(state),
    defaults: {},
    fieldPolicies: STANDARD_FIELD_POLICIES,
  };
}

export function toAuthoredModuleRequest(state: DescriptorWizardState): AuthoredModuleRequest {
  return { kind: 'discipline', document: toAuthoredDocument(state) };
}
