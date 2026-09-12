import { defineMessages, useIntl } from 'react-intl';
import { AcceptInvitationForm } from './AcceptInvitationForm.js';
import { AuthScreenLayout } from './ui/layouts/auth-screen-layout.js';
import { ControlIntl } from '../i18n/ControlIntl.js';

// Same id/text as NativeAuthRoutes.tsx's `auth.tagline` — reused rather than
// duplicated under a second id for identical copy.
const messages = defineMessages({
  tagline: { id: 'auth.tagline', defaultMessage: 'Tournament operations' },
});

function AcceptInvitationContent({
  initialToken,
}: {
  readonly initialToken?: string;
}): React.JSX.Element {
  const intl = useIntl();
  return (
    <AuthScreenLayout tagline={intl.formatMessage(messages.tagline)}>
      <AcceptInvitationForm initialToken={initialToken} />
    </AuthScreenLayout>
  );
}

/**
 * The `/invitations/accept` screen: the auth template supplies the brand
 * header, the centred panel and the page gutter, and the form composes the
 * owned card and form atoms inside it. Splitting the screen from the form
 * keeps the form a component the page tier positions, rather than one that
 * centres and margins itself.
 *
 * Wrapped in its own `ControlIntl` (openspec 0225 task 8.3, found by
 * `/impeccable critique`): this is a third real route-mount point,
 * `accept.astro`, rendered outside `ControlShell`/`Dashboard.tsx` — the two
 * `ControlIntl` already documented as its only mount points — so every
 * string here fell back to a raw literal with no `useIntl` context to
 * resolve against at all. `AcceptInvitationContent` calls `useIntl`, so it
 * has to render as `ControlIntl`'s child, not alongside it in the same
 * function body.
 */
export function AcceptInvitationScreen({
  initialToken,
}: {
  readonly initialToken?: string;
}): React.JSX.Element {
  return (
    <ControlIntl>
      <AcceptInvitationContent initialToken={initialToken} />
    </ControlIntl>
  );
}
