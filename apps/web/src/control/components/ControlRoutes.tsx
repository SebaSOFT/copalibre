import type { ControlApiClient, MatchConsoleApiClient } from '../lib/api-client.js';
import { ControlShell } from './ControlShell.js';
import { PersonProfilePage } from './pages/PersonProfilePage.js';
import { RegistrationReviewPage } from './pages/RegistrationReviewPage.js';
import { ReportReviewPage } from './pages/ReportReviewPage.js';
import { MatchesViewPage } from './pages/MatchesViewPage.js';
import { SeedingBuilderPage } from './pages/SeedingBuilderPage.js';
import { StandingsPage } from './pages/StandingsPage.js';
import { TournamentAuthoringTemplate } from './screens/TournamentAuthoringTemplate.js';
import { TournamentSettingsPage } from './pages/TournamentSettingsPage.js';
import { TournamentRulesetPage } from './pages/TournamentRulesetPage.js';
import { RolesPermissionsPage } from './pages/RolesPermissionsPage.js';
import { AuditTrailPage } from './pages/AuditTrailPage.js';
import { MatchConsolePage } from './pages/MatchConsolePage.js';
import { LoadMatchDataPage } from './pages/LoadMatchDataPage.js';
import { ZoneGroupPage } from './pages/ZoneGroupPage.js';
import { PromotionPlanPage } from './pages/PromotionPlanPage.js';
import { PreferencesPage } from './pages/PreferencesPage.js';
import { ClubManagementPage } from './pages/ClubManagementPage.js';
import { VenueManagementPage } from './pages/VenueManagementPage.js';
import { ScheduleBuilderPage } from './pages/ScheduleBuilderPage.js';
import { PlatformAdministrationPage } from './pages/PlatformAdministrationPage.js';
import { LiveConsolePage } from './pages/LiveConsolePage.js';
import { AnalyticsPage } from './pages/AnalyticsPage.js';
import { DashboardPage } from './pages/DashboardPage.js';

export function TournamentsControlRoute({
  organizationAlias,
  client,
}: {
  readonly organizationAlias: string;
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  return <DashboardPage client={client} organizationAlias={organizationAlias} />;
}

export function OrganizationControlRoute({
  organizationAlias,
  client,
}: {
  readonly organizationAlias: string;
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  return (
    <ControlShell
      active="organization"
      helpPath="organization"
      organizationAlias={organizationAlias}
    >
      <PreferencesPage client={client} organizationAlias={organizationAlias} />
    </ControlShell>
  );
}

export function LiveConsoleControlRoute({
  organizationAlias,
  client,
}: {
  readonly organizationAlias: string;
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  return (
    <ControlShell
      active="live-console"
      helpPath="live-console"
      organizationAlias={organizationAlias}
    >
      <LiveConsolePage client={client} organizationAlias={organizationAlias} />
    </ControlShell>
  );
}

export function AnalyticsControlRoute({
  organizationAlias,
  client,
}: {
  readonly organizationAlias: string;
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  return (
    <ControlShell active="analytics" helpPath="analytics" organizationAlias={organizationAlias}>
      <AnalyticsPage client={client} organizationAlias={organizationAlias} />
    </ControlShell>
  );
}

export function PlatformAdministrationControlRoute({
  client,
}: {
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  return (
    <ControlShell active="platform" helpPath="platform-administration">
      <PlatformAdministrationPage client={client} />
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
      <PreferencesPage client={client} organizationAlias={organizationAlias} />
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
      <ClubManagementPage client={client} organizationAlias={organizationAlias} />
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
      <VenueManagementPage client={client} organizationAlias={organizationAlias} />
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
      <ScheduleBuilderPage
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
      <TournamentAuthoringTemplate organizationAlias={organizationAlias} />
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
      <RegistrationReviewPage
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
      <TournamentSettingsPage
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
      <TournamentRulesetPage
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
      <PersonProfilePage
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
      <ReportReviewPage
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
      <MatchesViewPage
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
      <StandingsPage
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
      <SeedingBuilderPage
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
      <RolesPermissionsPage client={client} organizationAlias={organizationAlias} />
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
      <AuditTrailPage client={client} organizationAlias={organizationAlias} />
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
      <MatchConsolePage
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
      <LoadMatchDataPage
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
      <ZoneGroupPage
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
      <PromotionPlanPage
        client={client}
        organizationAlias={organizationAlias}
        stageNumber={stageNumber}
        tournamentAlias={tournamentAlias}
        zoneNumber={zoneNumber}
      />
    </ControlShell>
  );
}
