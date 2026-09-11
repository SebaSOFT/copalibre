import { useState } from 'react';
import { defineMessages, FormattedMessage, useIntl } from 'react-intl';
import { beginOidcLogin } from '../session/oidc-login.js';
import { navigateControl } from '../lib/control-navigation.js';
import { controlApiErrorFromResponse } from '../lib/api-client.js';
import { controlTokenStore } from '../session/token-store.js';
import { Button } from './ui/atoms/button.js';
import { Input } from './ui/atoms/input.js';
import { Field } from './ui/molecules/field.js';
import { useToast } from './ToastProvider.js';
import { AuthScreenTemplate } from './ui/templates/auth-screen-template.js';

// openspec 0225 task 2.6: every defaultMessage here was Spanish, and
// `auth.*` has no locale catalogue anywhere else in the repo — so every
// locale without its own override (all eight, currently) fell back to
// Spanish rather than the source language. Restated in English; a real
// per-locale catalogue for this namespace is separate work.
const messages = defineMessages({
  loginTitle: { id: 'auth.loginTitle', defaultMessage: 'Sign in to operate' },
  loginContext: { id: 'auth.loginContext', defaultMessage: 'Organization console' },
  emailLabel: { id: 'auth.emailLabel', defaultMessage: 'Email' },
  passwordLabel: { id: 'auth.passwordLabel', defaultMessage: 'Password' },
  loginSubmit: { id: 'auth.loginSubmit', defaultMessage: 'Sign in' },
  oidcButton: { id: 'auth.oidcButton', defaultMessage: 'Continue with identity provider' },
  forgotPasswordLink: {
    id: 'auth.forgotPasswordLink',
    defaultMessage: 'Forgot your password?',
  },
  forgotTitle: { id: 'auth.forgotTitle', defaultMessage: 'Recover password' },
  forgotSubmit: { id: 'auth.forgotSubmit', defaultMessage: 'Send link' },
  forgotBack: { id: 'auth.forgotBack', defaultMessage: 'Back to sign-in' },
  resetTitle: { id: 'auth.resetTitle', defaultMessage: 'Create new password' },
  resetSubmit: { id: 'auth.resetSubmit', defaultMessage: 'Reset password' },
  invalidResetLink: { id: 'auth.invalidResetLink', defaultMessage: 'Invalid recovery link.' },
  tagline: { id: 'auth.tagline', defaultMessage: 'Tournament operations' },
  passwordUpdated: {
    id: 'auth.passwordUpdated',
    defaultMessage: 'Password updated. You can now sign in.',
  },
  forgotLinkSent: {
    id: 'auth.forgotLinkSent',
    defaultMessage: 'If the email exists, a link has been sent.',
  },
});

export function LoginRoute(): React.JSX.Element {
  const intl = useIntl();
  const { pushError } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        throw await controlApiErrorFromResponse(res);
      }

      const data = await res.json();
      controlTokenStore.write(data.accessToken, Date.now() + data.expiresIn * 1000);

      const searchParams = new URLSearchParams(window.location.search);
      const returnTo = searchParams.get('returnTo') || '/control/';
      navigateControl(returnTo);
    } catch (error) {
      pushError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreenTemplate tagline={intl.formatMessage(messages.tagline)}>
      <p className="context">
        <FormattedMessage {...messages.loginContext} />
      </p>
      <h1>
        <FormattedMessage {...messages.loginTitle} />
      </h1>
      <form
        onSubmit={handleLogin}
        style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '2rem' }}
      >
        <Field id="login-email" label={intl.formatMessage(messages.emailLabel)}>
          <Input
            id="login-email"
            onChange={(e) => setEmail(e.target.value)}
            required
            type="email"
            value={email}
          />
        </Field>
        <Field id="login-password" label={intl.formatMessage(messages.passwordLabel)}>
          <Input
            id="login-password"
            onChange={(e) => setPassword(e.target.value)}
            required
            type="password"
            value={password}
          />
        </Field>
        <Button disabled={loading} type="submit">
          <FormattedMessage {...messages.loginSubmit} />
        </Button>
      </form>
      <div style={{ marginTop: '1rem' }}>
        <a
          className="cl-link cl-focusable"
          href="/control/forgot-password"
          onClick={(e) => {
            e.preventDefault();
            navigateControl('/control/forgot-password');
          }}
        >
          <FormattedMessage {...messages.forgotPasswordLink} />
        </a>
      </div>

      <hr
        style={{ margin: '2rem 0', border: 'none', borderTop: '1px solid var(--cl-border-muted)' }}
      />

      <Button onClick={() => beginOidcLogin()} type="button" variant="secondary">
        <FormattedMessage {...messages.oidcButton} />
      </Button>
    </AuthScreenTemplate>
  );
}

export function ForgotPasswordRoute(): React.JSX.Element {
  const intl = useIntl();
  const { push, pushError } = useToast();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw await controlApiErrorFromResponse(res);
      push({ severity: 'success', message: intl.formatMessage(messages.forgotLinkSent) });
    } catch (error) {
      pushError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreenTemplate tagline={intl.formatMessage(messages.tagline)}>
      <h1>
        <FormattedMessage {...messages.forgotTitle} />
      </h1>
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '2rem' }}
      >
        <Field id="forgot-email" label={intl.formatMessage(messages.emailLabel)}>
          <Input
            id="forgot-email"
            onChange={(e) => setEmail(e.target.value)}
            required
            type="email"
            value={email}
          />
        </Field>
        <Button disabled={loading} type="submit">
          <FormattedMessage {...messages.forgotSubmit} />
        </Button>
      </form>
      <div style={{ marginTop: '2rem' }}>
        <a
          className="cl-link cl-focusable"
          href="/control/login"
          onClick={(e) => {
            e.preventDefault();
            navigateControl('/control/login');
          }}
        >
          <FormattedMessage {...messages.forgotBack} />
        </a>
      </div>
    </AuthScreenTemplate>
  );
}

export function ResetPasswordRoute(): React.JSX.Element {
  const intl = useIntl();
  const { push, pushError } = useToast();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const searchParams = new URLSearchParams(window.location.search);
  const token = searchParams.get('token');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setLoading(true);

    try {
      const res = await fetch('/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });

      if (!res.ok) throw await controlApiErrorFromResponse(res);

      setSuccess(true);
      push({ severity: 'success', message: intl.formatMessage(messages.passwordUpdated) });
    } catch (error) {
      pushError(error);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <AuthScreenTemplate tagline={intl.formatMessage(messages.tagline)}>
        <p>{intl.formatMessage(messages.invalidResetLink)}</p>
        <a
          className="cl-link cl-focusable"
          href="/control/login"
          onClick={(e) => {
            e.preventDefault();
            navigateControl('/control/login');
          }}
        >
          <FormattedMessage {...messages.forgotBack} />
        </a>
      </AuthScreenTemplate>
    );
  }

  return (
    <AuthScreenTemplate tagline={intl.formatMessage(messages.tagline)}>
      <h1>
        <FormattedMessage {...messages.resetTitle} />
      </h1>
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '2rem' }}
      >
        <Field
          id="reset-password"
          label={`${intl.formatMessage(messages.passwordLabel)} (min 8 char)`}
        >
          <Input
            disabled={success}
            id="reset-password"
            minLength={8}
            onChange={(e) => setPassword(e.target.value)}
            required
            type="password"
            value={password}
          />
        </Field>
        {!success && (
          <Button disabled={loading} type="submit">
            <FormattedMessage {...messages.resetSubmit} />
          </Button>
        )}
      </form>
      {success && (
        <div style={{ marginTop: '2rem' }}>
          <a
            className="cl-link cl-focusable"
            href="/control/login"
            onClick={(e) => {
              e.preventDefault();
              navigateControl('/control/login');
            }}
          >
            <FormattedMessage {...messages.forgotBack} />
          </a>
        </div>
      )}
    </AuthScreenTemplate>
  );
}
