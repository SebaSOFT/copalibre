import React, { useState } from 'react';

export function AcceptInvitationForm({
  initialToken,
}: {
  readonly initialToken?: string;
} = {}): React.JSX.Element {
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
    return t ? null : 'No se encontró el token de invitación en el enlace.';
  });
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
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
        throw new Error(errorData.message || `Error al aceptar invitación (${response.status})`);
      }

      const data = await response.json();
      sessionStorage.setItem('copalibre_access_token', data.accessToken);
      localStorage.setItem('copalibre_access_token', data.accessToken);
      setSuccess(true);

      setTimeout(() => {
        window.location.assign('/control/app');
      }, 1200);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error inesperado al aceptar la invitación');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        maxWidth: '440px',
        width: '100%',
        margin: '2rem auto',
        padding: '2rem',
        background: 'var(--cl-surface-panel)',
        borderRadius: '8px',
        border: '1px solid var(--cl-border-muted)',
        color: 'var(--cl-text-primary)',
        boxShadow: '0 8px 32px var(--cl-surface-base)',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <img
          src="/copalibre-logo.svg"
          alt="CopaLibre Logo"
          style={{ width: '48px', height: '48px', marginBottom: '1rem' }}
        />
        <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '1.5rem', fontWeight: 600 }}>
          Aceptar Invitación
        </h1>
        <p style={{ margin: 0, color: 'var(--cl-text-muted)', fontSize: '0.875rem' }}>
          Configurá tu cuenta de administrador de CopaLibre
        </p>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            padding: '0.75rem 1rem',
            marginBottom: '1.25rem',
            background: 'var(--cl-surface-raised)',
            border: '1px solid var(--cl-state-destructive)',
            color: 'var(--cl-state-destructive)',
            borderRadius: '4px',
            fontSize: '0.875rem',
          }}
        >
          {error}
        </div>
      )}

      {success ? (
        <div
          role="status"
          style={{
            padding: '1rem',
            background: 'var(--cl-surface-raised)',
            border: '1px solid var(--cl-state-live)',
            color: 'var(--cl-state-live)',
            borderRadius: '4px',
            textAlign: 'center',
            fontSize: '0.875rem',
          }}
        >
          <p style={{ margin: '0 0 0.5rem 0', fontWeight: 600 }}>¡Cuenta configurada con éxito!</p>
          <p style={{ margin: 0, fontSize: '0.875rem' }}>Redirigiendo a la consola de control...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1.25rem' }}>
          <div>
            <label
              htmlFor="name"
              style={{
                display: 'block',
                marginBottom: '0.375rem',
                fontSize: '0.875rem',
                fontWeight: 500,
              }}
            >
              Nombre completo (opcional)
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Ana Pérez"
              disabled={loading || !token}
              style={{
                width: '100%',
                padding: '0.625rem 0.75rem',
                background: 'var(--cl-surface-base)',
                border: '1px solid var(--cl-border-muted)',
                borderRadius: '4px',
                color: 'inherit',
                fontSize: '0.875rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label
              htmlFor="password"
              style={{
                display: 'block',
                marginBottom: '0.375rem',
                fontSize: '0.875rem',
                fontWeight: 500,
              }}
            >
              Contraseña (mínimo 8 caracteres)
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              disabled={loading || !token}
              style={{
                width: '100%',
                padding: '0.625rem 0.75rem',
                background: 'var(--cl-surface-base)',
                border: '1px solid var(--cl-border-muted)',
                borderRadius: '4px',
                color: 'inherit',
                fontSize: '0.875rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              style={{
                display: 'block',
                marginBottom: '0.375rem',
                fontSize: '0.875rem',
                fontWeight: 500,
              }}
            >
              Confirmar contraseña
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              disabled={loading || !token}
              style={{
                width: '100%',
                padding: '0.625rem 0.75rem',
                background: 'var(--cl-surface-base)',
                border: '1px solid var(--cl-border-muted)',
                borderRadius: '4px',
                color: 'inherit',
                fontSize: '0.875rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !token}
            style={{
              padding: '0.75rem 1.25rem',
              background: !token ? 'var(--cl-surface-raised)' : 'var(--cl-color-cyan-400)',
              color: !token ? 'var(--cl-text-muted)' : 'var(--cl-color-ink-950)',
              border: 'none',
              borderRadius: '4px',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: loading || !token ? 'not-allowed' : 'pointer',
              opacity: loading || !token ? 0.7 : 1,
              transition: 'all 0.15s ease',
            }}
          >
            {loading ? 'Configurando cuenta...' : 'Aceptar y Comenzar'}
          </button>
        </form>
      )}
    </div>
  );
}
