import { type IntlShape } from 'react-intl';
import { rolesWithCapability } from '../../lib/role-access.js';
import { ROLE_LABEL } from '../../lib/role-labels.js';

/** The roles that hold `capability`, named in the catalogue's own words, for a "who can" line. */
export function whoCan(
  intl: IntlShape,
  capability: Parameters<typeof rolesWithCapability>[0],
): { readonly roleCount: number; readonly roles: string } {
  const roles = rolesWithCapability(capability);
  return {
    roleCount: roles.length,
    roles: intl.formatList(
      roles.map((role) => intl.formatMessage(ROLE_LABEL[role])),
      { type: 'conjunction' },
    ),
  };
}
