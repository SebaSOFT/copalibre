import MatchConsolePageStory from './MatchConsolePage.stories.js';
import PersonProfilePageStory from './PersonProfilePage.stories.js';
import QualificationPageStory from './QualificationPage.stories.js';
import SeedingBuilderPageStory from './SeedingBuilderPage.stories.js';
import ClubPortalRosterPageStory from './ClubPortalRosterPage.stories.js';
import RolesPermissionsPageStory from './RolesPermissionsPage.stories.js';
import TournamentRulesetPageStory from './TournamentRulesetPage.stories.js';
import ReportReviewPageStory from './ReportReviewPage.stories.js';
import PreferencesPageStory from './PreferencesPage.stories.js';
import AuditTrailPageStory from './AuditTrailPage.stories.js';
import RegistrationReviewPageStory from './RegistrationReviewPage.stories.js';
import StageHubPageStory from './StageHubPage.stories.js';
import StandingsPageStory from './StandingsPage.stories.js';
import MatchesViewPageStory from './MatchesViewPage.stories.js';
import PromotionPlanPageStory from './PromotionPlanPage.stories.js';
import ClubPortalMembersPageStory from './ClubPortalMembersPage.stories.js';
import ClubManagementPageStory from './ClubManagementPage.stories.js';
import LoadMatchDataPageStory from './LoadMatchDataPage.stories.js';
import LiveConsolePageStory from './LiveConsolePage.stories.js';
import AnalyticsPageStory from './AnalyticsPage.stories.js';
import TournamentSettingsPageStory from './TournamentSettingsPage.stories.js';
import ScheduleBuilderPageStory from './ScheduleBuilderPage.stories.js';
import ZoneGroupPageStory from './ZoneGroupPage.stories.js';
import PlatformAdministrationPageStory from './PlatformAdministrationPage.stories.js';
import VenueManagementPageStory from './VenueManagementPage.stories.js';
import DisciplineDocumentPageStory from './DisciplineDocumentPage.stories.js';
import DashboardPageStory from './DashboardPage.stories.js';
import TournamentHubPageStory from './TournamentHubPage.stories.js';
import 'storybook/test';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import type { ComponentType } from 'react';
import { withIntl } from '../../i18n/test-support.js';

type Mode = 'loaded' | 'failed' | 'empty' | 'loading';
const routes = [
  'AnalyticsPage',
  'AuditTrailPage',
  'ClubManagementPage',
  'ClubPortalMembersPage',
  'ClubPortalRosterPage',
  'DashboardPage',
  'DisciplineDocumentPage',
  'LiveConsolePage',
  'LoadMatchDataPage',
  'MatchConsolePage',
  'MatchesViewPage',
  'PersonProfilePage',
  'PlatformAdministrationPage',
  'PreferencesPage',
  'PromotionPlanPage',
  'QualificationPage',
  'RegistrationReviewPage',
  'ReportReviewPage',
  'RolesPermissionsPage',
  'ScheduleBuilderPage',
  'SeedingBuilderPage',
  'StageHubPage',
  'StandingsPage',
  'TournamentHubPage',
  'TournamentRulesetPage',
  'TournamentSettingsPage',
  'VenueManagementPage',
  'ZoneGroupPage',
];

const screens = {
  MatchConsolePage: MatchConsolePageStory.component,
  PersonProfilePage: PersonProfilePageStory.component,
  QualificationPage: QualificationPageStory.component,
  SeedingBuilderPage: SeedingBuilderPageStory.component,
  ClubPortalRosterPage: ClubPortalRosterPageStory.component,
  RolesPermissionsPage: RolesPermissionsPageStory.component,
  TournamentRulesetPage: TournamentRulesetPageStory.component,
  ReportReviewPage: ReportReviewPageStory.component,
  PreferencesPage: PreferencesPageStory.component,
  AuditTrailPage: AuditTrailPageStory.component,
  RegistrationReviewPage: RegistrationReviewPageStory.component,
  StageHubPage: StageHubPageStory.component,
  StandingsPage: StandingsPageStory.component,
  MatchesViewPage: MatchesViewPageStory.component,
  PromotionPlanPage: PromotionPlanPageStory.component,
  ClubPortalMembersPage: ClubPortalMembersPageStory.component,
  ClubManagementPage: ClubManagementPageStory.component,
  LoadMatchDataPage: LoadMatchDataPageStory.component,
  LiveConsolePage: LiveConsolePageStory.component,
  AnalyticsPage: AnalyticsPageStory.component,
  TournamentSettingsPage: TournamentSettingsPageStory.component,
  ScheduleBuilderPage: ScheduleBuilderPageStory.component,
  ZoneGroupPage: ZoneGroupPageStory.component,
  PlatformAdministrationPage: PlatformAdministrationPageStory.component,
  VenueManagementPage: VenueManagementPageStory.component,
  DisciplineDocumentPage: DisciplineDocumentPageStory.component,
  DashboardPage: DashboardPageStory.component,
  TournamentHubPage: TournamentHubPageStory.component,
} as Readonly<Record<string, ComponentType<{ mode: Mode }>>>;
function routeScreen(name: string): ComponentType<{ mode: Mode }> {
  const screen = screens[name];
  if (!screen) throw new Error(`Missing screen fixture: ${name}`);
  return screen;
}

describe.each(routes)('%s read states', (name) => {
  it('retains successful content after a failed read and offers immediate retry', async () => {
    const Screen = routeScreen(name);
    render(withIntl(<Screen mode="loaded" />));
    await waitFor(() => expect(document.querySelector('.cl-skeleton')).toBeNull());
    expect(document.querySelector('.cl-toast[data-severity="error"]')).toBeNull();
    cleanup();
    render(withIntl(<Screen mode="failed" />));
    await waitFor(() => expect(document.querySelector('.cl-stale-mark')).not.toBeNull());
    expect(screen.getAllByRole('button', { name: 'Retry' }).length).toBeGreaterThan(0);
    expect(document.querySelector('.cl-skeleton')).toBeNull();
  });

  it('keeps its heading and skeleton on the first failed read', async () => {
    const Screen = routeScreen(name);
    render(withIntl(<Screen mode="failed" />));
    await screen.findAllByRole('button', { name: 'Retry' });
    expect(screen.getAllByRole('heading', { level: 1 }).length).toBeGreaterThan(0);
    expect(document.querySelector('.cl-skeleton[aria-busy="true"]')).not.toBeNull();
  });

  it('renders a successful empty read without a failure toast or busy placeholder', async () => {
    const Screen = routeScreen(name);
    render(withIntl(<Screen mode="empty" />));
    await waitFor(() => expect(document.querySelector('.cl-skeleton')).toBeNull());
    expect(document.querySelector('.cl-toast[data-severity="error"]')).toBeNull();
  });
});
