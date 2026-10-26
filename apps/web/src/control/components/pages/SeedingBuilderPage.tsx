import { useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { messages } from '../../i18n/messages.en.js';
import {
  createControlApiClient,
  type ControlApiClient,
  type SeedingResponse,
} from '../../lib/api-client.js';
import { isGeneratedAhead } from '../../lib/generate-ahead.js';
import type { SeedAssignment } from '../../lib/seeding.js';
import { controlTokenStore } from '../../session/token-store.js';
import { SeedingBuilderTemplate } from '../screens/SeedingBuilderTemplate.js';
import { useToast } from '../ToastProvider.js';
import { Alert } from '../ui/atoms/alert.js';
import { Button } from '../ui/atoms/button.js';
import { Input } from '../ui/atoms/input.js';
import { ReadState } from '../ui/layouts/read-state.js';
import { Field } from '../ui/molecules/field.js';
import { useResilientRead } from './use-resilient-read.js';

/**
 * A stage's configuration override fields — the same dot-path-editing shape
 * `TournamentRulesetTemplate` uses one layer up, disabled once the stage is
 * seeded.
 */
function StageConfigurationSection({
  overrides,
  seeded,
  onApply,
}: {
  readonly overrides: Readonly<Record<string, unknown>>;
  readonly seeded: boolean;
  readonly onApply: (changed: Record<string, unknown>) => Promise<void>;
}): React.JSX.Element {
  const intl = useIntl();
  const [drafts, setDrafts] = useState<{ readonly field: string; readonly value: string }[]>(
    Object.entries(overrides).map(([field, value]) => ({ field, value: JSON.stringify(value) })),
  );
  const [newField, setNewField] = useState('');
  const [newValue, setNewValue] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="cl-card cl-chamfer cl-chamfer--control">
      <header className="cl-card__header">
        <h2 className="cl-card__title">
          <FormattedMessage {...messages.stageConfigurationTitle} />
        </h2>
      </header>
      <div className="cl-card__content">
        <ul aria-label={intl.formatMessage(messages.stageConfigurationTitle)}>
          {drafts.map((draft, index) => (
            <li key={draft.field}>
              <Field id={`stage-configuration-${index}`} label={draft.field}>
                <Input
                  disabled={seeded}
                  id={`stage-configuration-${index}`}
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
              </Field>
            </li>
          ))}
        </ul>

        <Field
          id="stage-configuration-new-field"
          label={intl.formatMessage(messages.stageConfigurationFieldLabel)}
        >
          <Input
            disabled={seeded}
            id="stage-configuration-new-field"
            onChange={(event) => setNewField(event.target.value)}
            value={newField}
          />
        </Field>
        <Field
          id="stage-configuration-new-value"
          label={intl.formatMessage(messages.stageConfigurationValueLabel)}
        >
          <Input
            disabled={seeded}
            id="stage-configuration-new-value"
            onChange={(event) => setNewValue(event.target.value)}
            value={newValue}
          />
        </Field>
        <Button
          disabled={seeded || newField.trim() === ''}
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

        <Button
          disabled={seeded || busy}
          onClick={() => {
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
            if (Object.keys(changed).length === 0) return;
            setBusy(true);
            void onApply(changed).finally(() => setBusy(false));
          }}
          type="button"
        >
          <FormattedMessage {...messages.stageConfigurationApply} />
        </Button>
        {seeded && (
          <Alert tone="info">
            <FormattedMessage {...messages.stageConfigurationSeededExplanation} />
          </Alert>
        )}
      </div>
    </div>
  );
}

export function SeedingBuilderPage({
  organizationAlias,
  tournamentAlias,
  stageNumber,
  client,
}: {
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
  readonly stageNumber: number;
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  const intl = useIntl();
  const { push, pushError } = useToast();
  const api = useMemo(
    () =>
      client ??
      createControlApiClient({
        fetch: globalThis.fetch.bind(globalThis),
        accessToken: () => controlTokenStore.read(),
      }),
    [client],
  );
  const read = useResilientRead(
    `control-seeding:${organizationAlias}:${tournamentAlias}:${stageNumber}`,
    async () => {
      const [loaded, configuration] = await Promise.all([
        api.fetchSeeding(organizationAlias, tournamentAlias, stageNumber),
        api.fetchStageConfiguration?.(organizationAlias, tournamentAlias, stageNumber),
      ]);
      let seeding = loaded;
      if (loaded.seeds.length === 0 && api.fetchPromotionPlansTargetingStage) {
        const targeting = await api.fetchPromotionPlansTargetingStage(
          organizationAlias,
          tournamentAlias,
          stageNumber,
        );
        const combined = targeting.flatMap((zone) => zone.combined);
        if (combined.length > 0)
          seeding = {
            ...loaded,
            seeds: combined.map((entrant, index) => ({
              seed: index + 1,
              entrantId: entrant.entrantId,
            })),
          };
      }
      return { seeding, stageOverrides: configuration?.overrides ?? {} };
    },
    { thing: intl.formatMessage(messages.seedingTitle) },
  );
  const tournamentRead = useResilientRead(
    `control-seeding-tournament:${organizationAlias}:${tournamentAlias}`,
    () =>
      api.fetchTournamentSettings?.(organizationAlias, tournamentAlias) ??
      Promise.resolve(undefined),
    { thing: intl.formatMessage(messages.tournamentHubTitle) },
  );
  const setSeeding = (seeding: SeedingResponse): void =>
    read.update((current) => ({ ...current, seeding }));
  const setStageOverrides = (stageOverrides: Readonly<Record<string, unknown>>): void =>
    read.update((current) => ({ ...current, stageOverrides }));
  if (read.data === undefined)
    return <ReadState {...read} title={intl.formatMessage(messages.seedingTitle)} />;
  const { seeding, stageOverrides } = read.data;

  const assignments: readonly SeedAssignment[] = seeding.seeds.map((seed) => ({
    ...seed,
    locked: false,
  }));

  return (
    <ReadState {...read} title={intl.formatMessage(messages.seedingTitle)}>
      <SeedingBuilderTemplate
        configurationSection={
          <StageConfigurationSection
            onApply={(changed) =>
              api
                .updateStageConfiguration?.(organizationAlias, tournamentAlias, stageNumber, {
                  overrides: changed,
                })
                .then((updated) => {
                  if (!updated) return;
                  setStageOverrides(updated.overrides);
                  push({
                    severity: 'success',
                    message: intl.formatMessage(messages.stageConfigurationSaved),
                  });
                })
                .catch((error: unknown) => {
                  pushError(error);
                }) ?? Promise.resolve()
            }
            overrides={stageOverrides}
            seeded={seeding.zones.some((zone) => zone.matches.length > 0)}
          />
        }
        hasRecordedResults={seeding.hasRecordedResults}
        {...(seeding.qualifiers === undefined || seeding.qualifiers.length === 0
          ? {}
          : {
              ahead: {
                zones: seeding.qualifiers,
                generated: isGeneratedAhead(seeding.zones),
                onGenerate: () =>
                  api
                    .publishSeeding(organizationAlias, tournamentAlias, stageNumber, {
                      ahead: true,
                    })
                    .then((result) => {
                      if (!result.persisted) return;
                      push({ severity: 'success', message: result.reason });
                      return api
                        .fetchSeeding(organizationAlias, tournamentAlias, stageNumber)
                        .then(setSeeding);
                    })
                    .catch((error: unknown) => {
                      pushError(error);
                    }),
              },
            })}
        zones={seeding.zones}
        names={seeding.names ?? {}}
        onPublish={(seeds) =>
          api
            .publishSeeding(organizationAlias, tournamentAlias, stageNumber, {
              seeds: seeds.map((seed) => ({ seed: seed.seed, entrantId: seed.entrantId })),
            })
            .then((result) => {
              // `persisted` is the server's confirmation the new order and
              // fixtures are durably saved, not only classified — re-fetch so
              // the bracket canvas reflects what's actually on disk rather
              // than trusting the classification response's own shape.
              if (!result.persisted) return;
              push({ severity: 'success', message: result.reason });
              return api
                .fetchSeeding(organizationAlias, tournamentAlias, stageNumber)
                .then(setSeeding);
            })
            .catch((error: unknown) => {
              pushError(error);
            })
        }
        organizationAlias={organizationAlias}
        seeds={assignments}
        stageNumber={stageNumber}
        tournamentAlias={tournamentAlias}
        tournamentName={tournamentRead.data?.name}
      />
    </ReadState>
  );
}
