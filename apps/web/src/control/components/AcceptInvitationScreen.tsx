import { AcceptInvitationForm } from './AcceptInvitationForm.js';
import { AuthScreenLayout } from './ui/layouts/auth-screen-layout.js';

/**
 * The `/invitations/accept` screen: the auth template supplies the brand
 * header, the centred panel and the page gutter, and the form composes the
 * owned card and form atoms inside it. Splitting the screen from the form
 * keeps the form a component the page tier positions, rather than one that
 * centres and margins itself.
 */
export function AcceptInvitationScreen({
  initialToken,
}: {
  readonly initialToken?: string;
}): React.JSX.Element {
  return (
    <AuthScreenLayout tagline="Control de torneos">
      <AcceptInvitationForm initialToken={initialToken} />
    </AuthScreenLayout>
  );
}
