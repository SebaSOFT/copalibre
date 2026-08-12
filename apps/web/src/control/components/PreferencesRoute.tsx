import { useEffect, useState } from 'react';
import { FormattedMessage, defineMessages } from 'react-intl';
import { controlTokenStore } from '../session/token-store.js';

const messages = defineMessages({
  title: {
    id: 'preferences.title',
    defaultMessage: 'Personal Preferences',
  },
  patTitle: {
    id: 'preferences.patTitle',
    defaultMessage: 'Personal Access Tokens',
  },
  patDescription: {
    id: 'preferences.patDescription',
    defaultMessage: 'Generate tokens to access the API directly. Tokens are only shown once.',
  },
  createPat: {
    id: 'preferences.createPat',
    defaultMessage: 'Generate Token',
  },
  patLabel: {
    id: 'preferences.patLabel',
    defaultMessage: 'Token Label',
  },
  patExpiresIn: {
    id: 'preferences.patExpiresIn',
    defaultMessage: 'Expires in (days)',
  },
  patCreated: {
    id: 'preferences.patCreated',
    defaultMessage: 'Token created. Copy it now:',
  },
  revokePat: {
    id: 'preferences.revokePat',
    defaultMessage: 'Revoke',
  },
  noTokens: {
    id: 'preferences.noTokens',
    defaultMessage: 'No active personal access tokens.',
  },
});

export interface PatResponse {
  readonly tokenId: string;
  readonly label: string;
  readonly scopes: readonly string[];
  readonly revoked: boolean;
  readonly expiresAt: string;
  readonly lastUsedAt?: string;
  readonly createdAt: string;
}

export interface PatCreatedResponse extends PatResponse {
  readonly token: string;
}

export function PreferencesRoute(): React.JSX.Element {
  const [tokens, setTokens] = useState<readonly PatResponse[]>([]);
  const [newToken, setNewToken] = useState<PatCreatedResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [label, setLabel] = useState('');
  const [expiresInDays, setExpiresInDays] = useState(30);

  useEffect(() => {
    let mounted = true;
    const token = controlTokenStore.read();
    void fetch('/api/auth/pat', {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    }).then((res) => {
      if (res.ok) {
        res.json().then((data) => {
          if (mounted) {
            setTokens(data as PatResponse[]);
            setLoading(false);
          }
        });
      } else {
        if (mounted) setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;

    const token = controlTokenStore.read();
    const res = await fetch('/api/auth/pat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ label, expiresInDays }),
    });

    if (res.ok) {
      const data = (await res.json()) as PatCreatedResponse;
      setNewToken(data);
      setTokens([...tokens, data]);
      setLabel('');
    }
  };

  const handleRevoke = async (tokenId: string) => {
    const token = controlTokenStore.read();
    const res = await fetch(`/api/auth/pat/${tokenId}`, { 
      method: 'DELETE',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
    if (res.ok) {
      setTokens(tokens.filter((t) => t.tokenId !== tokenId));
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
      <h1><FormattedMessage {...messages.title} /></h1>

      <section style={{ marginTop: '2rem', background: 'var(--cl-surface-alt)', padding: '1.5rem', borderRadius: '8px' }}>
        <h2><FormattedMessage {...messages.patTitle} /></h2>
        <p><FormattedMessage {...messages.patDescription} /></p>

        <form onSubmit={handleCreate} style={{ display: 'flex', gap: '1rem', marginTop: '1rem', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label htmlFor="pat-label"><FormattedMessage {...messages.patLabel} /></label>
            <input
              id="pat-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
              style={{ padding: '0.5rem', border: '1px solid var(--cl-border-base)' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label htmlFor="pat-expires"><FormattedMessage {...messages.patExpiresIn} /></label>
            <input
              id="pat-expires"
              type="number"
              min="1"
              max="365"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(parseInt(e.target.value))}
              required
              style={{ padding: '0.5rem', border: '1px solid var(--cl-border-base)', width: '80px' }}
            />
          </div>
          <button
            type="submit"
            disabled={!label.trim()}
            style={{
              padding: '0.5rem 1rem',
              background: 'var(--cl-state-live)',
              color: 'var(--cl-surface-base)',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            <FormattedMessage {...messages.createPat} />
          </button>
        </form>

        {newToken && (
          <div style={{ marginTop: '1.5rem', padding: '1rem', border: '1px solid var(--cl-state-live)', background: 'var(--cl-surface-base)' }}>
            <strong><FormattedMessage {...messages.patCreated} /></strong>
            <code style={{ display: 'block', padding: '1rem', backgroundColor: 'var(--c-surface-sunken)', borderRadius: '0.25rem', marginTop: '0.5rem', wordBreak: 'break-all' }}>
              {newToken.token}
            </code>
          </div>
        )}

        <div style={{ marginTop: '2rem' }}>
          {loading ? (
            <p>Cargando...</p>
          ) : tokens.length === 0 ? (
            <p><FormattedMessage {...messages.noTokens} /></p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {tokens.filter(t => !t.revoked).map((token) => (
                <li key={token.tokenId} style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', borderBottom: '1px solid var(--cl-border-base)' }}>
                  <div>
                    <strong>{token.label}</strong>
                    <div style={{ fontSize: '0.875rem', color: 'var(--cl-text-secondary)', marginTop: '0.25rem' }}>
                      Expira: {new Date(token.expiresAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRevoke(token.tokenId)}
                    style={{
                      background: 'transparent',
                      color: 'var(--cl-state-destructive)',
                      border: '1px solid currentColor',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    <FormattedMessage {...messages.revokePat} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
