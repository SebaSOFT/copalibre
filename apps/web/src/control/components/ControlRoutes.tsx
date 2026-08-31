import type { ControlApiClient, MatchConsoleApiClient } from '../lib/api-client.js';
import { ControlShell } from './ControlShell.js';
import { PersonProfileRoute } from './PersonProfileRoute.js';
import { RegistrationReviewRoute } from './RegistrationReviewRoute.js';
import { ReportReviewRoute } from './ReportReviewRoute.js';
import { MatchesViewRoute } from './MatchesViewRoute.js';
import { SeedingBuilderRoute } from './SeedingBuilderRoute.js';
import { StandingsRoute } from './StandingsRoute.js';
import { TournamentAuthoringPage } from './TournamentAuthoringPage.js';
import { TournamentSettingsRoute } from './TournamentSettingsRoute.js';
import { TournamentRulesetRoute } from './TournamentRulesetRoute.js';
import { RolesPermissionsRoute } from './RolesPermissionsRoute.js';
import { AuditTrailRoute } from './AuditTrailRoute.js';
import { MatchConsoleRoute } from './MatchConsoleRoute.js';
import { LoadMatchDataRoute } from './LoadMatchDataRoute.js';
import { ZoneGroupRoute } from './ZoneGroupRoute.js';
import { PromotionPlanRoute } from './PromotionPlanRoute.js';
import { PreferencesRoute } from './PreferencesRoute.js';
import { ClubManagementRoute } from './ClubManagementRoute.js';
import { VenueManagementRoute } from './VenueManagementRoute.js';
import { ScheduleBuilderRoute } from './ScheduleBuilderRoute.js';
import { PlatformAdministrationRoute } from './PlatformAdministrationRoute.js';

export function PlatformAdministrationControlRoute({
  client,
}: {
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  return (
    <ControlShell active="platform" helpPath="platform-administration">
      <PlatformAdministrationRoute client={client} />
    </ControlShell>
  );
}

export function PreferencesControlRoute({
  organizationAlias,
  client,
}: {
  readonly organizationAlias: string;
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  return (
    <ControlShell active="preferences" helpPath="preferences" organizationAlias={organizationAlias}>
      <PreferencesRoute client={client} organizationAlias={organizationAlias} />
    </ControlShell>
  );
}

export function ClubManagementControlRoute({
  organizationAlias,
  client,
}: {
  readonly organizationAlias: string;
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  return (
    <ControlShell active="clubs" helpPath="clubs" organizationAlias={organizationAlias}>
      <ClubManagementRoute client={client} organizationAlias={organizationAlias} />
    </ControlShell>
  );
}

export function VenueManagementControlRoute({
  organizationAlias,
  client,
}: {
  readonly organizationAlias: string;
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  return (
    <ControlShell active="resources" helpPath="resources" organizationAlias={organizationAlias}>
      <VenueManagementRoute client={client} organizationAlias={organizationAlias} />
    </ControlShell>
  );
}

export function ScheduleControlRoute({
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
    <ControlShell helpPath="schedule" organizationAlias={organizationAlias}>
      <ScheduleBuilderRoute
        client={client}
        organizationAlias={organizationAlias}
        stageNumber={stageNumber}
        tournamentAlias={tournamentAlias}
      />
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

export function TournamentSettingsControlRoute({
  organizationAlias,
  tournamentAlias,
  client,
}: {
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  return (
    <ControlShell helpPath="tournament-authoring" organizationAlias={organizationAlias}>
      <TournamentSettingsRoute
        client={client}
        organizationAlias={organizationAlias}
        tournamentAlias={tournamentAlias}
      />
    </ControlShell>
  );
}

export function TournamentRulesetControlRoute({
  organizationAlias,
  tournamentAlias,
  client,
}: {
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  return (
    <ControlShell helpPath="tournament-authoring" organizationAlias={organizationAlias}>
      <TournamentRulesetRoute
        client={client}
        organizationAlias={organizationAlias}
        tournamentAlias={tournamentAlias}
      />
    </ControlShell>
  );
}

export function PersonProfileControlRoute({
  organizationAlias,
  personId,
  client,
}: {
  readonly organizationAlias: string;
  readonly personId: string;
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  return (
    <ControlShell helpPath="person-profile" organizationAlias={organizationAlias}>
      <PersonProfileRoute
        client={client}
        organizationAlias={organizationAlias}
        personId={personId}
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

export function MatchesViewControlRoute({
  organizationAlias,
  tournamentAlias,
  client,
}: {
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  return (
    <ControlShell helpPath="matches-view" organizationAlias={organizationAlias}>
      <MatchesViewRoute
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

export function AuditTrailControlRoute({
  organizationAlias,
  client,
}: {
  readonly organizationAlias: string;
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  return (
    <ControlShell
      active="audit-trail"
      helpPath="roles-permissions"
      organizationAlias={organizationAlias}
    >
      <AuditTrailRoute client={client} organizationAlias={organizationAlias} />
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

export function LoadMatchDataControlRoute({
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
    <ControlShell helpPath="load-match-data" organizationAlias={organizationAlias}>
      <LoadMatchDataRoute
        client={client}
        matchId={matchId}
        organizationAlias={organizationAlias}
        tournamentAlias={tournamentAlias}
      />
    </ControlShell>
  );
}

export function ZoneGroupControlRoute({
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
    <ControlShell helpPath="zone-groups" organizationAlias={organizationAlias}>
      <ZoneGroupRoute
        client={client}
        organizationAlias={organizationAlias}
        stageNumber={stageNumber}
        tournamentAlias={tournamentAlias}
      />
    </ControlShell>
  );
}

export function PromotionPlanControlRoute({
  organizationAlias,
  tournamentAlias,
  stageNumber,
  zoneNumber,
  client,
}: {
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
  readonly stageNumber: number;
  readonly zoneNumber: number;
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  return (
    <ControlShell helpPath="promotion-plan" organizationAlias={organizationAlias}>
      <PromotionPlanRoute
        client={client}
        organizationAlias={organizationAlias}
        stageNumber={stageNumber}
        tournamentAlias={tournamentAlias}
        zoneNumber={zoneNumber}
      />
    </ControlShell>
  );
}
