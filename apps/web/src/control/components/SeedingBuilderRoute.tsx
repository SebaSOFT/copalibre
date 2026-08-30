import { useEffect, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  createControlApiClient,
  type ControlApiClient,
  type SeedingResponse,
} from '../lib/api-client.js';
import type { SeedAssignment } from '../lib/seeding.js';
import { controlLinkClick } from '../lib/control-navigation.js';
import { controlTokenStore } from '../session/token-store.js';
import { SeedingBuilderPage } from './SeedingBuilderPage.js';
import { Button } from './ui/atoms/button.js';
import { FormField } from './ui/molecules/form-field.js';
import { useToast } from './ToastProvider.js';
import { messages } from '../i18n/messages.en.js';

/**
 * Rename/format-change/delete for the stage this builder is on (task 2.3).
 * A rename always applies; format-change and delete are disabled once the
 * stage is seeded — `seeded` names why in the same place the button lives,
 * not only in a toast after the fact.
 */
function StageSettingsSection({
  currentFormat,
  seeded,
  onRename,
  onChangeFormat,
  onDelete,
}: {
  readonly currentFormat: string;
  readonly seeded: boolean;
  readonly onRename: (name: string) => Promise<void>;
  readonly onChangeFormat: (format: string) => Promise<void>;
  readonly onDelete: () => Promise<void>;
}): React.JSX.Element {
  const intl = useIntl();
  const [name, setName] = useState('');
  const [format, setFormat] = useState(currentFormat);

  return (
    <div className="cl-card cl-chamfer cl-chamfer--control">
      <header className="cl-card__header">
        <h2 className="cl-card__title">
          <FormattedMessage {...messages.stageSettingsTitle} />
        </h2>
      </header>
      <div className="cl-card__content">
        <FormField id="stage-rename" label={intl.formatMessage(messages.stageRenameLabel)}>
          <input
            className="cl-input cl-input--default cl-focusable"
            id="stage-rename"
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </FormField>
        <Button
          disabled={name.trim() === ''}
          onClick={() => void onRename(name).then(() => setName(''))}
          type="button"
          variant="secondary"
        >
          <FormattedMessage {...messages.stageRenameSubmit} />
        </Button>

        <FormField id="stage-format" label={intl.formatMessage(messages.stageFormatLabel)}>
          <input
            className="cl-input cl-input--default cl-focusable"
            disabled={seeded}
            id="stage-format"
            onChange={(event) => setFormat(event.target.value)}
            value={format}
          />
        </FormField>
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
          <p className="cl-inline-alert">
            <FormattedMessage {...messages.stageSeededExplanation} />
          </p>
        )}
      </div>
    </div>
  );
}

export function SeedingBuilderRoute({
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
  const [seeding, setSeeding] = useState<SeedingResponse | undefined>(undefined);
  const [status, setStatus] = useState('Cargando sembrado...');

  useEffect(() => {
    let live = true;
    api
      .fetchSeeding(organizationAlias, tournamentAlias, stageNumber)
      .then(async (loaded) => {
        if (!live) return loaded;
        // Pre-fill only when nothing has been drawn or manually placed yet
        // — a stage that already has seeds is never overridden by a
        // promotion plan, so this only runs for the empty case, and any
        // failure here just leaves the builder starting empty, as before.
        if (loaded.seeds.length > 0 || !api.fetchPromotionPlansTargetingStage) return loaded;
        try {
          const targeting = await api.fetchPromotionPlansTargetingStage(
            organizationAlias,
            tournamentAlias,
            stageNumber,
          );
          // Server already orders by zoneNumber; concatenating in that order
          // is the whole "combine per zone" rule (design.md) — each zone's
          // own `combined` list is already itself in the right order.
          const combined = targeting.flatMap((zone) => zone.combined);
          if (combined.length === 0) return loaded;
          return {
            ...loaded,
            seeds: combined.map((entrant, index) => ({
              seed: index + 1,
              entrantId: entrant.entrantId,
            })),
          };
        } catch {
          return loaded;
        }
      })
      .then((loaded) => {
        if (!live) return;
        setSeeding(loaded);
        setStatus('');
      })
      .catch(() => {
        if (live) setStatus('No se pudo cargar el sembrado.');
      });
    return () => {
      live = false;
    };
  }, [api, organizationAlias, tournamentAlias, stageNumber]);

  if (seeding === undefined) return <p className="cl-inline-alert">{status}</p>;

  const assignments: readonly SeedAssignment[] = seeding.seeds.map((seed) => ({
    ...seed,
    locked: false,
  }));

  return (
    <>
      <a
        className="cl-focusable"
        href={`/control/${organizationAlias}/tournaments/${tournamentAlias}/stages/${stageNumber}/zones`}
        onClick={controlLinkClick(
          `/control/${organizationAlias}/tournaments/${tournamentAlias}/stages/${stageNumber}/zones`,
        )}
      >
        Zonas y grupos
      </a>
      <StageSettingsSection
        currentFormat={seeding.format}
        onChangeFormat={(format) =>
          api
            .updateStage?.(organizationAlias, tournamentAlias, stageNumber, { format })
            .then(() => api.fetchSeeding(organizationAlias, tournamentAlias, stageNumber))
            .then((next) => next && setSeeding(next))
            .catch((error: unknown) => {
              pushError(error);
            }) ?? Promise.resolve()
        }
        onDelete={() =>
          api
            .deleteStage?.(organizationAlias, tournamentAlias, stageNumber)
            .then(() => {
              push({ severity: 'success', message: 'Fase eliminada.' });
            })
            .catch((error: unknown) => {
              pushError(error);
            }) ?? Promise.resolve()
        }
        onRename={(name) =>
          api
            .updateStage?.(organizationAlias, tournamentAlias, stageNumber, { name })
            .then(() => {
              push({ severity: 'success', message: 'Fase renombrada.' });
            })
            .catch((error: unknown) => {
              pushError(error);
            }) ?? Promise.resolve()
        }
        seeded={seeding.matches.length > 0}
      />
      <SeedingBuilderPage
        hasRecordedResults={seeding.hasRecordedResults}
        matches={seeding.matches}
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
        tournamentName={tournamentAlias}
      />
    </>
  );
}
