import type { MessageDescriptor } from 'react-intl';
import type { OrganizationRole } from '@copalibre/domain';
import { messages } from '../i18n/messages.en.js';

/** The catalogue label of each organization role, shared by every screen that names one. */
export const ROLE_LABEL: Record<OrganizationRole, MessageDescriptor> = {
  admin: messages.rolesRoleAdmin,
  'club-admin': messages.rolesRoleClubAdmin,
  'tournament-admin': messages.rolesRoleTournamentAdmin,
  referee: messages.rolesRoleReferee,
  broadcaster: messages.rolesRoleBroadcaster,
  viewer: messages.rolesRoleViewer,
};
