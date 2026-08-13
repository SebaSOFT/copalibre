import type { ControlApiClient, MatchConsoleApiClient } from '../lib/api-client.js';
import { ControlShell } from './ControlShell.js';
import { RegistrationReviewRoute } from './RegistrationReviewRoute.js';
import { ReportReviewRoute } from './ReportReviewRoute.js';
import { SeedingBuilderRoute } from './SeedingBuilderRoute.js';
import { StandingsRoute } from './StandingsRoute.js';
import { TournamentAuthoringPage } from './TournamentAuthoringPage.js';
import { RolesPermissionsRoute } from './RolesPermissionsRoute.js';
import { MatchConsoleRoute } from './MatchConsoleRoute.js';
import { PreferencesRoute } from './PreferencesRoute.js';

export function PreferencesControlRoute({
  organizationAlias,
}: {
  readonly organizationAlias: string;
}): React.JSX.Element {
  return (
    <ControlShell active="preferences" helpPath="preferences" organizationAlias={organizationAlias}>
      <PreferencesRoute />
    </ControlShell>
  );
}

export function TournamentAuthoringControlRoute({
  organizationAlias,
}: {
  readonly organizationAlias: string;
}): React.JSX.Element {
  return (
    <ControlShell helpPath="tournament-authoring" organizationAlias={organizationAlias}>
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
    <ControlShell helpPath="registration-review" organizationAlias={organizationAlias}>
      <RegistrationReviewRoute
        organizationAlias={organizationAlias}
        tournamentAlias={tournamentAlias}
        now={now}
      />
    </ControlShell>
  );
}

export function ReportReviewControlRoute({
  organizationAlias,
  tournamentAlias,
  client,
}: {
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  return (
    <ControlShell helpPath="report-review" organizationAlias={organizationAlias}>
      <ReportReviewRoute
        client={client}
        organizationAlias={organizationAlias}
        tournamentAlias={tournamentAlias}
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
    <ControlShell helpPath="standings" organizationAlias={organizationAlias}>
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
    <ControlShell helpPath="seeding" organizationAlias={organizationAlias}>
      <SeedingBuilderRoute
        client={client}
        organizationAlias={organizationAlias}
        stageNumber={stageNumber}
        tournamentAlias={tournamentAlias}
      />
    </ControlShell>
  );
}

export function RolesPermissionsControlRoute({
  organizationAlias,
  client,
}: {
  readonly organizationAlias: string;
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  return (
    <ControlShell active="roles" helpPath="roles-permissions" organizationAlias={organizationAlias}>
      <RolesPermissionsRoute client={client} organizationAlias={organizationAlias} />
    </ControlShell>
  );
}

export function MatchConsoleControlRoute({
  organizationAlias,
  tournamentAlias,
  matchId,
  client,
}: {
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
  readonly matchId: string;
  readonly client?: MatchConsoleApiClient;
}): React.JSX.Element {
  return (
    <ControlShell helpPath="match-console" organizationAlias={organizationAlias}>
      <MatchConsoleRoute
        client={client}
        matchId={matchId}
        organizationAlias={organizationAlias}
        tournamentAlias={tournamentAlias}
      />
    </ControlShell>
  );
}
