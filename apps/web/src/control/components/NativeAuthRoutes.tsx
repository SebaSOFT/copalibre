import { useState } from 'react';
import { useIntl, defineMessages, FormattedMessage } from 'react-intl';
import { beginOidcLogin } from '../session/oidc-login.js';
import { navigateControl } from '../lib/control-navigation.js';
import { controlTokenStore } from '../session/token-store.js';

const messages = defineMessages({
  loginTitle: { id: 'auth.loginTitle', defaultMessage: 'Ingresá para operar' },
  loginContext: { id: 'auth.loginContext', defaultMessage: 'Consola de organización' },
  emailLabel: { id: 'auth.emailLabel', defaultMessage: 'Email' },
  passwordLabel: { id: 'auth.passwordLabel', defaultMessage: 'Contraseña' },
  loginSubmit: { id: 'auth.loginSubmit', defaultMessage: 'Ingresar' },
  oidcButton: { id: 'auth.oidcButton', defaultMessage: 'Continuar con proveedor de identidad' },
  forgotPasswordLink: { id: 'auth.forgotPasswordLink', defaultMessage: '¿Olvidaste tu contraseña?' },
  forgotTitle: { id: 'auth.forgotTitle', defaultMessage: 'Recuperar contraseña' },
  forgotSubmit: { id: 'auth.forgotSubmit', defaultMessage: 'Enviar enlace' },
  forgotBack: { id: 'auth.forgotBack', defaultMessage: 'Volver al ingreso' },
  resetTitle: { id: 'auth.resetTitle', defaultMessage: 'Crear nueva contraseña' },
  resetSubmit: { id: 'auth.resetSubmit', defaultMessage: 'Restablecer' },
});

export function LoginRoute(): React.JSX.Element {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        throw new Error('Credenciales incorrectas');
      }

      const data = await res.json();
      controlTokenStore.write(data.accessToken, Date.now() + data.expiresIn * 1000);
      
      const searchParams = new URLSearchParams(window.location.search);
      const returnTo = searchParams.get('returnTo') || '/control/callback';
      navigateControl(returnTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de autenticación');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <p className="context"><FormattedMessage {...messages.loginContext} /></p>
      <h1><FormattedMessage {...messages.loginTitle} /></h1>
      <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '2rem' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}><FormattedMessage {...messages.emailLabel} /></label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}><FormattedMessage {...messages.passwordLabel} /></label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required style={inputStyle} />
        </div>
        <button type="submit" disabled={loading} style={primaryButtonStyle}>
          <FormattedMessage {...messages.loginSubmit} />
        </button>
      </form>
      {error && <p style={{ color: 'var(--cl-state-destructive)', marginTop: '1rem' }}>{error}</p>}
      
      <div style={{ marginTop: '1rem' }}>
        <a href="/control/forgot-password" onClick={(e) => { e.preventDefault(); navigateControl('/control/forgot-password'); }}>
          <FormattedMessage {...messages.forgotPasswordLink} />
        </a>
      </div>

      <hr style={{ margin: '2rem 0', border: 'none', borderTop: '1px solid var(--cl-border-base)' }} />

      <button onClick={() => beginOidcLogin()} type="button" style={secondaryButtonStyle}>
        <FormattedMessage {...messages.oidcButton} />
      </button>
    </AuthLayout>
  );
}

export function ForgotPasswordRoute(): React.JSX.Element {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setStatus('Si el correo existe, se ha enviado un enlace.');
    } catch {
      setStatus('Ocurrió un error. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <h1><FormattedMessage {...messages.forgotTitle} /></h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '2rem' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}><FormattedMessage {...messages.emailLabel} /></label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} />
        </div>
        <button type="submit" disabled={loading} style={primaryButtonStyle}>
          <FormattedMessage {...messages.forgotSubmit} />
        </button>
      </form>
      {status && <p style={{ marginTop: '1rem' }}>{status}</p>}
      <div style={{ marginTop: '2rem' }}>
        <a href="/control/login" onClick={(e) => { e.preventDefault(); navigateControl('/control/login'); }}>
          <FormattedMessage {...messages.forgotBack} />
        </a>
      </div>
    </AuthLayout>
  );
}

export function ResetPasswordRoute(): React.JSX.Element {
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<string | null>(null);
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

      if (!res.ok) throw new Error('Enlace inválido o expirado.');
      
      setSuccess(true);
      setStatus('Contraseña actualizada. Ya puedes ingresar.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Ocurrió un error.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <AuthLayout>
        <p>Enlace de recuperación inválido.</p>
        <a href="/control/login" onClick={(e) => { e.preventDefault(); navigateControl('/control/login'); }}>
          <FormattedMessage {...messages.forgotBack} />
        </a>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h1><FormattedMessage {...messages.resetTitle} /></h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '2rem' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}><FormattedMessage {...messages.passwordLabel} /> (min 8 char)</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={8} required style={inputStyle} disabled={success} />
        </div>
        {!success && (
          <button type="submit" disabled={loading} style={primaryButtonStyle}>
            <FormattedMessage {...messages.resetSubmit} />
          </button>
        )}
      </form>
      {status && <p style={{ marginTop: '1rem' }}>{status}</p>}
      {success && (
        <div style={{ marginTop: '2rem' }}>
          <a href="/control/login" onClick={(e) => { e.preventDefault(); navigateControl('/control/login'); }}>
            <FormattedMessage {...messages.forgotBack} />
          </a>
        </div>
      )}
    </AuthLayout>
  );
}

function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', gridTemplateRows: 'auto 1fr', padding: 'clamp(24px, 5vw, 64px)', fontFamily: 'var(--cl-font-body)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--cl-space-3)' }}>
        <img src="/copalibre-logo.svg" alt="" width="44" height="44" style={{ border: '1px solid var(--cl-state-live)', padding: '4px' }} />
        <div style={{ display: 'grid', gap: '2px' }}>
          <strong style={{ fontFamily: 'var(--cl-font-display)', fontSize: '1.125rem' }}>CopaLibre</strong>
          <span style={{ color: 'var(--cl-text-muted)', fontFamily: 'var(--cl-font-mono)', fontSize: '0.75rem' }}>Control de torneos</span>
        </div>
      </header>
      <section style={{ width: 'min(100%, 560px)', alignSelf: 'center', marginBlock: 'var(--cl-space-8)', borderLeft: '4px solid var(--cl-state-live)', padding: 'var(--cl-space-6) 0 var(--cl-space-6) var(--cl-space-6)' }}>
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
  font: '700 0.875rem var(--cl-font-body)',
  cursor: 'pointer',
  marginTop: '1rem',
};

const secondaryButtonStyle = {
  ...primaryButtonStyle,
  background: 'transparent',
  color: 'var(--cl-text-primary)',
};
