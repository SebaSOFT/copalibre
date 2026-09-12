import React, { useState } from 'react';
import { defineMessages, FormattedMessage, useIntl } from 'react-intl';
import { Alert } from './ui/atoms/alert.js';
import { Button } from './ui/atoms/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/atoms/card.js';
import { Input } from './ui/atoms/input.js';
import { Field } from './ui/molecules/field.js';

/**
 * Invitation acceptance: the one unauthenticated screen that built its own
 * card, its own inputs and its own button out of inline styles, with soft
 * corners no other Control-web surface uses and a self-set `margin` the
 * component tier is not allowed to own. It now composes the same atoms its
 * sibling auth screens already use, inside the shared auth template.
 *
 * Every string here was hardcoded Spanish (found by `/impeccable critique`,
 * openspec 0225 task 8.3) — the exact `auth.*` namespace gap task 2.6
 * already restated in English elsewhere in this file's sibling screens.
 * `invitation.*` has no locale catalogue anywhere either, so every locale
 * currently falls back to the English `defaultMessage`; a real per-locale
 * catalogue for this namespace is separate work.
 */
const messages = defineMessages({
  missingToken: {
    id: 'invitation.missingToken',
    defaultMessage: 'The invitation token was not found in the link.',
  },
  passwordTooShort: {
    id: 'invitation.passwordTooShort',
    defaultMessage: 'The password must be at least 8 characters.',
  },
  passwordMismatch: {
    id: 'invitation.passwordMismatch',
    defaultMessage: 'Passwords do not match.',
  },
  acceptFailed: {
    id: 'invitation.acceptFailed',
    defaultMessage: 'Failed to accept the invitation ({status}).',
  },
  unexpectedError: {
    id: 'invitation.unexpectedError',
    defaultMessage: 'Unexpected error accepting the invitation.',
  },
  title: { id: 'invitation.title', defaultMessage: 'Accept invitation' },
  subtitle: {
    id: 'invitation.subtitle',
    defaultMessage: 'Set up your CopaLibre administrator account',
  },
  successHeading: { id: 'invitation.successHeading', defaultMessage: 'Account set up!' },
  successBody: {
    id: 'invitation.successBody',
    defaultMessage: 'Redirecting to the control console…',
  },
  nameLabel: { id: 'invitation.nameLabel', defaultMessage: 'Full name (optional)' },
  namePlaceholder: { id: 'invitation.namePlaceholder', defaultMessage: 'E.g. Ana Pérez' },
  passwordLabel: {
    id: 'invitation.passwordLabel',
    defaultMessage: 'Password (minimum 8 characters)',
  },
  confirmPasswordLabel: {
    id: 'invitation.confirmPasswordLabel',
    defaultMessage: 'Confirm password',
  },
  submitLoading: { id: 'invitation.submitLoading', defaultMessage: 'Setting up account…' },
  submit: { id: 'invitation.submit', defaultMessage: 'Accept and start' },
});

export function AcceptInvitationForm({
  initialToken,
  navigate = (url: string) => {
    if (typeof window !== 'undefined') {
      window.location.assign(url);
    }
  },
}: {
  readonly initialToken?: string;
  readonly navigate?: (url: string) => void;
}): React.JSX.Element {
  const intl = useIntl();
  const [token] = useState<string | null>(() => {
    if (initialToken) return initialToken;
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('token');
  });
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    if (initialToken) return null;
    if (typeof window === 'undefined') return null;
    const t = new URLSearchParams(window.location.search).get('token');
    return t ? null : intl.formatMessage(messages.missingToken);
  });
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (password.length < 8) {
      setError(intl.formatMessage(messages.passwordTooShort));
      return;
    }

    if (password !== confirmPassword) {
      setError(intl.formatMessage(messages.passwordMismatch));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/auth/accept-invitation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          password,
          name: name.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message ||
            intl.formatMessage(messages.acceptFailed, { status: response.status }),
        );
      }

      const data = await response.json();
      sessionStorage.setItem('copalibre_access_token', data.accessToken);
      localStorage.setItem('copalibre_access_token', data.accessToken);
      setSuccess(true);

      setTimeout(() => {
        navigate('/control/app');
      }, 1200);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : intl.formatMessage(messages.unexpectedError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card aria-labelledby="accept-invitation-title">
      <CardHeader>
        <CardTitle id="accept-invitation-title">
          <FormattedMessage {...messages.title} />
        </CardTitle>
        <CardDescription>
          <FormattedMessage {...messages.subtitle} />
        </CardDescription>
      </CardHeader>

      <CardContent>
        {error && <Alert tone="destructive">{error}</Alert>}

        {success ? (
          <Alert heading={intl.formatMessage(messages.successHeading)} tone="success">
            <FormattedMessage {...messages.successBody} />
          </Alert>
        ) : (
          <form className="cl-auth-form" onSubmit={handleSubmit}>
            <Field id="name" label={intl.formatMessage(messages.nameLabel)}>
              <Input
                disabled={loading || !token}
                id="name"
                onChange={(e) => setName(e.target.value)}
                placeholder={intl.formatMessage(messages.namePlaceholder)}
                type="text"
                value={name}
              />
            </Field>

            <Field id="password" label={intl.formatMessage(messages.passwordLabel)}>
              <Input
                disabled={loading || !token}
                id="password"
                minLength={8}
                onChange={(e) => setPassword(e.target.value)}
                required
                type="password"
                value={password}
              />
            </Field>

            <Field id="confirmPassword" label={intl.formatMessage(messages.confirmPasswordLabel)}>
              <Input
                disabled={loading || !token}
                id="confirmPassword"
                minLength={8}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                type="password"
                value={confirmPassword}
              />
            </Field>

            <Button disabled={loading || !token} type="submit">
              {loading ? (
                <FormattedMessage {...messages.submitLoading} />
              ) : (
                <FormattedMessage {...messages.submit} />
              )}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
