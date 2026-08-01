import { ControlShell } from './ControlShell.js';
import { RegistrationReviewRoute } from './RegistrationReviewRoute.js';
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
