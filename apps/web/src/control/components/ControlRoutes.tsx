import type { ControlApiClient } from '../lib/api-client.js';
import { ControlShell } from './ControlShell.js';
import { RegistrationReviewRoute } from './RegistrationReviewRoute.js';
import { SeedingBuilderRoute } from './SeedingBuilderRoute.js';
import { StandingsRoute } from './StandingsRoute.js';
import { TournamentAuthoringPage } from './TournamentAuthoringPage.js';

export function TournamentAuthoringControlRoute({
  organizationAlias,
}: {
  readonly organizationAlias: string;
}): React.JSX.Element {
  return (
    <ControlShell organizationAlias={organizationAlias}>
      <TournamentAuthoringPage organizationAlias={organizationAlias} />
    </ControlShell>
  );
}

export function RegistrationReviewControlRoute({
  organizationAlias,
  tournamentAlias,
  now,
}: {
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
  readonly now: string;
}): React.JSX.Element {
  return (
    <ControlShell organizationAlias={organizationAlias}>
      <RegistrationReviewRoute
        organizationAlias={organizationAlias}
        tournamentAlias={tournamentAlias}
        now={now}
      />
    </ControlShell>
  );
}

export function StandingsControlRoute({
  organizationAlias,
  tournamentAlias,
  stageNumber,
  client,
}: {
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
  readonly stageNumber: number;
  /** Injected by tests; the page mounts without one and builds its own. */
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  return (
    <ControlShell organizationAlias={organizationAlias}>
      <StandingsRoute
        client={client}
        organizationAlias={organizationAlias}
        stageNumber={stageNumber}
        tournamentAlias={tournamentAlias}
      />
    </ControlShell>
  );
}

export function SeedingControlRoute({
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
  return (
    <ControlShell organizationAlias={organizationAlias}>
      <SeedingBuilderRoute
        client={client}
        organizationAlias={organizationAlias}
        stageNumber={stageNumber}
        tournamentAlias={tournamentAlias}
      />
    </ControlShell>
  );
}
