import { useState } from 'react';
import { defineMessages, FormattedMessage } from 'react-intl';
import { beginOidcLogin } from '../session/oidc-login.js';
import { navigateControl } from '../lib/control-navigation.js';
import { controlApiErrorFromResponse } from '../lib/api-client.js';
import { controlTokenStore } from '../session/token-store.js';
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
        <div>
          <label htmlFor="login-email" style={{ display: 'block', marginBottom: '0.5rem' }}>
            <FormattedMessage {...messages.emailLabel} />
          </label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={inputStyle}
          />
        </div>
        <div>
          <label htmlFor="login-password" style={{ display: 'block', marginBottom: '0.5rem' }}>
            <FormattedMessage {...messages.passwordLabel} />
          </label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={inputStyle}
          />
        </div>
        <button type="submit" disabled={loading} style={primaryButtonStyle}>
          <FormattedMessage {...messages.loginSubmit} />
        </button>
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

      <button onClick={() => beginOidcLogin()} type="button" style={secondaryButtonStyle}>
        <FormattedMessage {...messages.oidcButton} />
      </button>
    </AuthLayout>
  );
}

export function ForgotPasswordRoute(): React.JSX.Element {
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
        <div>
          <label htmlFor="forgot-email" style={{ display: 'block', marginBottom: '0.5rem' }}>
            <FormattedMessage {...messages.emailLabel} />
          </label>
          <input
            id="forgot-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={inputStyle}
          />
        </div>
        <button type="submit" disabled={loading} style={primaryButtonStyle}>
          <FormattedMessage {...messages.forgotSubmit} />
        </button>
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
        <div>
          <label htmlFor="reset-password" style={{ display: 'block', marginBottom: '0.5rem' }}>
            <FormattedMessage {...messages.passwordLabel} /> (min 8 char)
          </label>
          <input
            id="reset-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
            style={inputStyle}
            disabled={success}
          />
        </div>
        {!success && (
          <button type="submit" disabled={loading} style={primaryButtonStyle}>
            <FormattedMessage {...messages.resetSubmit} />
          </button>
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
          src="/copalibre-logo.svg"
          alt=""
          width="44"
          height="44"
          style={{ border: '1px solid var(--cl-state-live)', padding: '4px' }}
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

const inputStyle = {
  width: '100%',
  padding: '0.75rem',
  border: '1px solid var(--cl-border-base)',
  borderRadius: '4px',
  fontFamily: 'inherit',
};

const primaryButtonStyle = {
  minHeight: '48px',
  border: '1px solid var(--cl-state-live)',
  borderRadius: '4px',
  padding: 'var(--cl-space-3) var(--cl-space-5)',
  background: 'var(--cl-state-live)',
  color: 'var(--cl-surface-base)',
  fontFamily: 'var(--cl-font-body)',
  fontSize: 'var(--cl-font-size-sm)',
  fontWeight: 700,
  cursor: 'pointer',
  marginTop: '1rem',
};

const secondaryButtonStyle = {
  ...primaryButtonStyle,
  background: 'transparent',
  color: 'var(--cl-text-primary)',
};
