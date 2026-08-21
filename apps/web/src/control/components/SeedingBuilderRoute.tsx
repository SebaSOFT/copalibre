import { useEffect, useMemo, useState } from 'react';
import {
  ControlApiError,
  createControlApiClient,
  type ControlApiClient,
  type SeedingResponse,
} from '../lib/api-client.js';
import type { SeedAssignment } from '../lib/seeding.js';
import { controlLinkClick } from '../lib/control-navigation.js';
import { controlTokenStore } from '../session/token-store.js';
import { SeedingBuilderPage } from './SeedingBuilderPage.js';

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
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let live = true;
    api
      .fetchSeeding(organizationAlias, tournamentAlias, stageNumber)
      .then(async (loaded) => {
        if (!live) return loaded;
        // Pre-fill only when nothing has been drawn or manually placed yet
        // (0121) — a stage that already has seeds is never overridden by a
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
      {notice !== '' && (
        <p className="cl-inline-alert" role="alert">
          {notice}
        </p>
      )}
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
              setNotice(`${result.reason} — sembrado guardado.`);
              return api
                .fetchSeeding(organizationAlias, tournamentAlias, stageNumber)
                .then(setSeeding);
            })
            .catch((error: unknown) =>
              // The server's own reason, not a status code: a 409 here says
              // "seeding cannot change once a result exists", which is the
              // sentence the operator needs.
              setNotice(
                error instanceof ControlApiError
                  ? error.message
                  : 'No se pudo publicar el sembrado.',
              ),
            )
        }
        organizationAlias={organizationAlias}
        seeds={assignments}
        tournamentName={tournamentAlias}
      />
    </>
  );
}
