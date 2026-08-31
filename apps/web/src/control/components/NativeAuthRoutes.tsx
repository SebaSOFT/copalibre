import { useState } from 'react';
import { defineMessages, FormattedMessage, useIntl } from 'react-intl';
import { beginOidcLogin } from '../session/oidc-login.js';
import { navigateControl } from '../lib/control-navigation.js';
import { controlApiErrorFromResponse } from '../lib/api-client.js';
import { controlTokenStore } from '../session/token-store.js';
import { Button } from './ui/atoms/button.js';
import { Input } from './ui/atoms/input.js';
import { FormField } from './ui/molecules/form-field.js';
import { useToast } from './ToastProvider.js';

const messages = defineMessages({
  loginTitle: { id: 'auth.loginTitle', defaultMessage: 'Ingresá para operar' },
  loginContext: { id: 'auth.loginContext', defaultMessage: 'Consola de organización' },
  emailLabel: { id: 'auth.emailLabel', defaultMessage: 'Email' },
  passwordLabel: { id: 'auth.passwordLabel', defaultMessage: 'Contraseña' },
  loginSubmit: { id: 'auth.loginSubmit', defaultMessage: 'Ingresar' },
  oidcButton: { id: 'auth.oidcButton', defaultMessage: 'Continuar con proveedor de identidad' },
  forgotPasswordLink: {
    id: 'auth.forgotPasswordLink',
    defaultMessage: '¿Olvidaste tu contraseña?',
  },
  forgotTitle: { id: 'auth.forgotTitle', defaultMessage: 'Recuperar contraseña' },
  forgotSubmit: { id: 'auth.forgotSubmit', defaultMessage: 'Enviar enlace' },
  forgotBack: { id: 'auth.forgotBack', defaultMessage: 'Volver al ingreso' },
  resetTitle: { id: 'auth.resetTitle', defaultMessage: 'Crear nueva contraseña' },
  resetSubmit: { id: 'auth.resetSubmit', defaultMessage: 'Restablecer' },
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
      const res = await fetch('/api/auth/login', {
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
      const returnTo = searchParams.get('returnTo') || '/control/callback';
      navigateControl(returnTo);
    } catch (error) {
      pushError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
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
        <FormField id="login-email" label={intl.formatMessage(messages.emailLabel)}>
          <Input
            id="login-email"
            onChange={(e) => setEmail(e.target.value)}
            required
            type="email"
            value={email}
          />
        </FormField>
        <FormField id="login-password" label={intl.formatMessage(messages.passwordLabel)}>
          <Input
            id="login-password"
            onChange={(e) => setPassword(e.target.value)}
            required
            type="password"
            value={password}
          />
        </FormField>
        <Button disabled={loading} type="submit">
          <FormattedMessage {...messages.loginSubmit} />
        </Button>
      </form>
      <div style={{ marginTop: '1rem' }}>
        <a
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
        style={{ margin: '2rem 0', border: 'none', borderTop: '1px solid var(--cl-border-base)' }}
      />

      <Button onClick={() => beginOidcLogin()} type="button" variant="secondary">
        <FormattedMessage {...messages.oidcButton} />
      </Button>
    </AuthLayout>
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
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw await controlApiErrorFromResponse(res);
      push({ severity: 'success', message: 'Si el correo existe, se ha enviado un enlace.' });
    } catch (error) {
      pushError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <h1>
        <FormattedMessage {...messages.forgotTitle} />
      </h1>
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '2rem' }}
      >
        <FormField id="forgot-email" label={intl.formatMessage(messages.emailLabel)}>
          <Input
            id="forgot-email"
            onChange={(e) => setEmail(e.target.value)}
            required
            type="email"
            value={email}
          />
        </FormField>
        <Button disabled={loading} type="submit">
          <FormattedMessage {...messages.forgotSubmit} />
        </Button>
      </form>
      <div style={{ marginTop: '2rem' }}>
        <a
          href="/control/login"
          onClick={(e) => {
            e.preventDefault();
            navigateControl('/control/login');
          }}
        >
          <FormattedMessage {...messages.forgotBack} />
        </a>
      </div>
    </AuthLayout>
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
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });

      if (!res.ok) throw await controlApiErrorFromResponse(res);

      setSuccess(true);
      push({ severity: 'success', message: 'Contraseña actualizada. Ya puedes ingresar.' });
    } catch (error) {
      pushError(error);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <AuthLayout>
        <p>Enlace de recuperación inválido.</p>
        <a
          href="/control/login"
          onClick={(e) => {
            e.preventDefault();
            navigateControl('/control/login');
          }}
        >
          <FormattedMessage {...messages.forgotBack} />
        </a>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h1>
        <FormattedMessage {...messages.resetTitle} />
      </h1>
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '2rem' }}
      >
        <FormField
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
        </FormField>
        {!success && (
          <Button disabled={loading} type="submit">
            <FormattedMessage {...messages.resetSubmit} />
          </Button>
        )}
      </form>
      {success && (
        <div style={{ marginTop: '2rem' }}>
          <a
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
    </AuthLayout>
  );
}

function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        minHeight: '100vh',
        minWidth: 0,
        maxWidth: '100%',
        display: 'grid',
        gridTemplateRows: 'auto 1fr',
        padding: 'clamp(24px, 5vw, 64px)',
        fontFamily: 'var(--cl-font-body)',
        overflowWrap: 'anywhere',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--cl-space-3)' }}>
        <img
          alt=""
          height="44"
          src="/copalibre-logo.svg"
          style={{ border: '1px solid var(--cl-state-live)', padding: '4px' }}
          width="44"
        />
        <div style={{ display: 'grid', gap: '2px' }}>
          <strong
            style={{ fontFamily: 'var(--cl-font-display)', fontSize: 'var(--cl-font-size-md)' }}
          >
            CopaLibre
          </strong>
          <span
            style={{
              color: 'var(--cl-text-muted)',
              fontFamily: 'var(--cl-font-mono)',
              fontSize: 'var(--cl-font-size-xs)',
            }}
          >
            Control de torneos
          </span>
        </div>
      </header>
      <section
        style={{
          width: 'min(100%, 560px)',
          minWidth: 0,
          maxWidth: '100%',
          boxSizing: 'border-box',
          alignSelf: 'center',
          marginBlock: 'var(--cl-space-8)',
          borderLeft: '4px solid var(--cl-state-live)',
          padding: 'var(--cl-space-6) 0 var(--cl-space-6) var(--cl-space-6)',
        }}
      >
        {children}
      </section>
    </main>
  );
}
