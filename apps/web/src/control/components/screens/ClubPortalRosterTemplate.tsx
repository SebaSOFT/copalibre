import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import type {
  ClubMemberResponse,
  ClubTeamResponse,
  ControlApiClient,
} from '../../lib/api-client.js';
import { Button } from '../ui/atoms/button.js';
import { Card } from '../ui/atoms/card.js';
import { Checkbox } from '../ui/atoms/checkbox.js';
import { Input } from '../ui/atoms/input.js';
import { Select } from '../ui/atoms/select.js';
import { Field } from '../ui/molecules/field.js';
import { messages } from '../../i18n/messages.en.js';
import { ListScreenLayout } from '../ui/layouts/list-screen-layout.js';

type SquadRole = 'player' | 'substitute' | 'coach' | 'staff';

const SQUAD_ROLES: readonly SquadRole[] = ['player', 'substitute', 'coach', 'staff'];

/**
 * Composes the roster-submission wizard from the data `ClubPortalRosterPage`
 * supplies: team selection/creation and squad assembly are this component's
 * own screen state; `onSubmit` fires once, with the assembled squad.
 */
export function ClubPortalRosterTemplate({
  api,
  members,
  teams,
  onCreateTeam,
  onSubmit,
}: {
  readonly api: ControlApiClient;
  readonly members: readonly ClubMemberResponse[];
  readonly teams: readonly ClubTeamResponse[];
  readonly onCreateTeam: (name: string) => Promise<ClubTeamResponse | undefined>;
  readonly onSubmit: (
    teamId: string,
    squad: readonly { readonly personId: string; readonly role: SquadRole }[],
  ) => Promise<void>;
}): React.JSX.Element {
  const intl = useIntl();

  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [newTeamName, setNewTeamName] = useState('');
  const [roleByPersonId, setRoleByPersonId] = useState<Readonly<Record<string, SquadRole>>>({});

  const squadRoleLabel: Record<SquadRole, string> = {
    player: intl.formatMessage(messages.clubPortalRosterRolePlayer),
    substitute: intl.formatMessage(messages.clubPortalRosterRoleSubstitute),
    coach: intl.formatMessage(messages.clubPortalRosterRoleCoach),
    staff: intl.formatMessage(messages.clubPortalRosterRoleStaff),
  };

  function toggleMember(personId: string, included: boolean): void {
    setRoleByPersonId((current) => {
      if (!included) {
        return Object.fromEntries(
          Object.entries(current).filter(([existingPersonId]) => existingPersonId !== personId),
        );
      }
      return { ...current, [personId]: 'player' };
    });
  }

  async function createTeam(): Promise<void> {
    const team = await onCreateTeam(newTeamName);
    if (team) {
      setSelectedTeamId(team.teamId);
      setNewTeamName('');
    }
  }

  async function submit(): Promise<void> {
    if (selectedTeamId === '') return;
    await onSubmit(
      selectedTeamId,
      Object.entries(roleByPersonId).map(([personId, role]) => ({ personId, role })),
    );
  }

  const teamOptions = teams.map((team) => ({ value: team.teamId, label: team.name }));
  const squadSize = Object.keys(roleByPersonId).length;

  const listingNode = (
    <div className="cl-screen-sections">
      <Card
        aria-label={intl.formatMessage(messages.clubPortalRosterTeamHeading)}
        className="cl-chamfer cl-chamfer--control"
      >
        <header className="cl-card__header">
          <h2 className="cl-card__title">
            <FormattedMessage {...messages.clubPortalRosterTeamHeading} />
          </h2>
        </header>
        <div className="cl-card__content">
          <div className="cl-platform-form-grid">
            <Field
              id="roster-team-select"
              label={intl.formatMessage(messages.clubPortalRosterTeamSelect)}
            >
              <Select
                aria-label={intl.formatMessage(messages.clubPortalRosterTeamSelect)}
                id="roster-team-select"
                onValueChange={setSelectedTeamId}
                options={teamOptions}
                value={selectedTeamId}
              />
            </Field>
            {api.createClubTeam && (
              <>
                <Field
                  id="roster-new-team-name"
                  label={intl.formatMessage(messages.clubPortalRosterNewTeamName)}
                >
                  <Input
                    aria-label={intl.formatMessage(messages.clubPortalRosterNewTeamName)}
                    id="roster-new-team-name"
                    onChange={(event) => setNewTeamName(event.target.value)}
                    value={newTeamName}
                  />
                </Field>
                <Button onClick={() => void createTeam()} type="button" variant="secondary">
                  <FormattedMessage {...messages.clubPortalRosterCreateTeam} />
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>

      <Card
        aria-label={intl.formatMessage(messages.clubPortalRosterSquadHeading)}
        className="cl-chamfer cl-chamfer--control"
      >
        <header className="cl-card__header">
          <h2 className="cl-card__title">
            <FormattedMessage {...messages.clubPortalRosterSquadHeading} />
          </h2>
        </header>
        <div className="cl-card__content">
          <ul>
            {members.map((member) => {
              const role = roleByPersonId[member.personId];
              return (
                <li key={member.personId} className="cl-role-user">
                  <Checkbox
                    aria-label={member.displayName}
                    checked={role !== undefined}
                    id={`roster-member-${member.personId}`}
                    onCheckedChange={(checked) => toggleMember(member.personId, checked)}
                  />
                  <span>{member.displayName}</span>
                  {role !== undefined && (
                    <Select
                      aria-label={intl.formatMessage(messages.clubPortalRosterRoleLabel, {
                        name: member.displayName,
                      })}
                      onValueChange={(value) =>
                        setRoleByPersonId((current) => ({
                          ...current,
                          [member.personId]: value as SquadRole,
                        }))
                      }
                      options={SQUAD_ROLES.map((squadRole) => ({
                        value: squadRole,
                        label: squadRoleLabel[squadRole],
                      }))}
                      value={role}
                    />
                  )}
                </li>
              );
            })}
          </ul>
          {members.length === 0 && (
            <p className="cl-list-screen__empty">
              <FormattedMessage {...messages.clubPortalRosterNoMembers} />
            </p>
          )}
        </div>
      </Card>

      <Button
        disabled={selectedTeamId === '' || squadSize === 0}
        onClick={() => void submit()}
        type="button"
      >
        <FormattedMessage {...messages.clubPortalRosterSubmit} />
      </Button>
    </div>
  );

  return (
    <ListScreenLayout
      listing={listingNode}
      title={<FormattedMessage {...messages.clubPortalRosterTitle} />}
    />
  );
}
