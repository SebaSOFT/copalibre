import { API_PATH_PREFIX } from '../../lib/api-path.js';
import { useEffect, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { beginOidcLogin } from '../session/oidc-login.js';
import { navigateControl } from '../lib/control-navigation.js';
import { controlApiErrorFromResponse } from '../lib/api-client.js';
import { controlTokenStore, recordAuthMethod } from '../session/token-store.js';
import { Button } from './ui/atoms/button.js';
import { Input } from './ui/atoms/input.js';
import { Field } from './ui/molecules/field.js';
import { useToast } from './ToastProvider.js';
import { messages } from '../i18n/messages.en.js';
import { AuthScreenLayout } from './ui/layouts/auth-screen-layout.js';
import { PageHeader } from './ui/organisms/page-header.js';

export function LoginRoute(): React.JSX.Element {
  const intl = useIntl();
  const { push, pushError } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // A failed silent renewal redirects here with this reason —
  // surfaced once, on the query string this screen was actually reached
  // with, never re-triggered by anything the operator does on this screen.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('reason') === 'session_expired') {
      push({ severity: 'info', message: intl.formatMessage(messages.authSessionExpired) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch(`${API_PATH_PREFIX}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        throw await controlApiErrorFromResponse(res);
      }

      const data = await res.json();
      controlTokenStore.write(data.accessToken, Date.now() + data.expiresIn * 1000);
      recordAuthMethod('native');

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
    <AuthScreenLayout tagline={intl.formatMessage(messages.authTagline)}>
      <p className="context">
        <FormattedMessage {...messages.authLoginContext} />
      </p>
      <PageHeader title={<FormattedMessage {...messages.authLoginTitle} />} />
      <form
        onSubmit={handleLogin}
        style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '2rem' }}
      >
        <Field id="login-email" label={intl.formatMessage(messages.authEmailLabel)}>
          <Input
            id="login-email"
            onChange={(e) => setEmail(e.target.value)}
            required
            type="email"
            value={email}
          />
        </Field>
        <Field id="login-password" label={intl.formatMessage(messages.authPasswordLabel)}>
          <Input
            id="login-password"
            onChange={(e) => setPassword(e.target.value)}
            required
            type="password"
            value={password}
          />
        </Field>
        <Button disabled={loading} type="submit">
          <FormattedMessage {...messages.authLoginSubmit} />
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
          <FormattedMessage {...messages.authForgotPasswordLink} />
        </a>
      </div>

      <hr
        style={{ margin: '2rem 0', border: 'none', borderTop: '1px solid var(--cl-border-muted)' }}
      />

      <Button onClick={() => beginOidcLogin()} type="button" variant="secondary">
        <FormattedMessage {...messages.authOidcButton} />
      </Button>
      <p>
        <a className="cl-link cl-focusable" href="/">
          <FormattedMessage {...messages.authPublicHome} />
        </a>
      </p>
    </AuthScreenLayout>
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
      const res = await fetch(`${API_PATH_PREFIX}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw await controlApiErrorFromResponse(res);
      push({ severity: 'success', message: intl.formatMessage(messages.authForgotLinkSent) });
    } catch (error) {
      pushError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreenLayout tagline={intl.formatMessage(messages.authTagline)}>
      <PageHeader title={<FormattedMessage {...messages.authForgotTitle} />} />
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '2rem' }}
      >
        <Field id="forgot-email" label={intl.formatMessage(messages.authEmailLabel)}>
          <Input
            id="forgot-email"
            onChange={(e) => setEmail(e.target.value)}
            required
            type="email"
            value={email}
          />
        </Field>
        <Button disabled={loading} type="submit">
          <FormattedMessage {...messages.authForgotSubmit} />
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
          <FormattedMessage {...messages.authForgotBack} />
        </a>
      </div>
    </AuthScreenLayout>
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
      const res = await fetch(`${API_PATH_PREFIX}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });

      if (!res.ok) throw await controlApiErrorFromResponse(res);

      setSuccess(true);
      push({ severity: 'success', message: intl.formatMessage(messages.authPasswordUpdated) });
    } catch (error) {
      pushError(error);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <AuthScreenLayout tagline={intl.formatMessage(messages.authTagline)}>
        <PageHeader title={<FormattedMessage {...messages.authResetTitle} />} />
        <p>{intl.formatMessage(messages.authInvalidResetLink)}</p>
        <a
          className="cl-link cl-focusable"
          href="/control/login"
          onClick={(e) => {
            e.preventDefault();
            navigateControl('/control/login');
          }}
        >
          <FormattedMessage {...messages.authForgotBack} />
        </a>
      </AuthScreenLayout>
    );
  }

  return (
    <AuthScreenLayout tagline={intl.formatMessage(messages.authTagline)}>
      <PageHeader title={<FormattedMessage {...messages.authResetTitle} />} />
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '2rem' }}
      >
        <Field
          id="reset-password"
          label={intl.formatMessage(messages.authPasswordWithMinimum, { minimum: 8 })}
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
            <FormattedMessage {...messages.authResetSubmit} />
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
            <FormattedMessage {...messages.authForgotBack} />
          </a>
        </div>
      )}
    </AuthScreenLayout>
  );
}
