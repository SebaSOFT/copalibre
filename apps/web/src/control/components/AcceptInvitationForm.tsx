import React, { useState } from 'react';
import { Button } from './ui/atoms/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/atoms/card.js';
import { Input } from './ui/atoms/input.js';
import { FormField } from './ui/molecules/form-field.js';

/**
 * Invitation acceptance: the one unauthenticated screen that built its own
 * card, its own inputs and its own button out of inline styles, with soft
 * corners no other Control-web surface uses and a self-set `margin` the
 * component tier is not allowed to own. It now composes the same atoms its
 * sibling auth screens already use, inside the shared auth template.
 */
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
        navigate('/control/app');
      }, 1200);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error inesperado al aceptar la invitación');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card aria-labelledby="accept-invitation-title">
      <CardHeader>
        <CardTitle id="accept-invitation-title">Aceptar invitación</CardTitle>
        <CardDescription>Configurá tu cuenta de administrador de CopaLibre</CardDescription>
      </CardHeader>

      <CardContent>
        {error && (
          <p className="cl-inline-alert cl-inline-alert--destructive" role="alert">
            {error}
          </p>
        )}

        {success ? (
          <div
            className="cl-inline-alert cl-inline-alert--live cl-inline-alert--stacked"
            role="status"
          >
            <p className="cl-inline-alert__title">¡Cuenta configurada con éxito!</p>
            <p className="cl-inline-alert__body">Redirigiendo a la consola de control…</p>
          </div>
        ) : (
          <form className="cl-auth-form" onSubmit={handleSubmit}>
            <FormField id="name" label="Nombre completo (opcional)">
              <Input
                disabled={loading || !token}
                id="name"
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Ana Pérez"
                type="text"
                value={name}
              />
            </FormField>

            <FormField id="password" label="Contraseña (mínimo 8 caracteres)">
              <Input
                disabled={loading || !token}
                id="password"
                minLength={8}
                onChange={(e) => setPassword(e.target.value)}
                required
                type="password"
                value={password}
              />
            </FormField>

            <FormField id="confirmPassword" label="Confirmar contraseña">
              <Input
                disabled={loading || !token}
                id="confirmPassword"
                minLength={8}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                type="password"
                value={confirmPassword}
              />
            </FormField>

            <Button disabled={loading || !token} type="submit">
              {loading ? 'Configurando cuenta…' : 'Aceptar y comenzar'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
