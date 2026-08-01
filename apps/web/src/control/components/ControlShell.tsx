import { SIDENAV } from '../lib/dashboard.js';

export function ControlShell({
  organizationAlias,
  active = 'Torneos',
  children,
}: {
  readonly organizationAlias: string;
  readonly active?: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="cl-control" style={shellStyle}>
      <nav aria-label="Secciones" style={navStyle}>
        <div style={brandStyle}>
          <strong>COPALIBRE CMD</strong>
          <span style={metaStyle}>BROADCAST OPS</span>
        </div>
        <ul style={navListStyle}>
          {SIDENAV.map((item) => (
            <li key={item.label}>
              <a
                className="cl-focusable"
                href={`/control/${organizationAlias}${item.path}`}
                style={{
                  ...navLinkStyle,
                  ...(item.label === active ? navLinkActiveStyle : {}),
                }}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <main style={mainStyle}>{children}</main>
    </div>
  );
}

const shellStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'grid',
  gridTemplateColumns: 'minmax(180px, 240px) 1fr',
  background: 'var(--cl-surface-base)',
  color: 'var(--cl-text-primary)',
  fontFamily: 'var(--cl-font-body)',
};

const navStyle: React.CSSProperties = {
  borderRight: '1px solid var(--cl-border-muted)',
  background: 'var(--cl-surface-panel)',
  padding: 'var(--cl-space-4)',
};

const brandStyle: React.CSSProperties = {
  display: 'grid',
  gap: 'var(--cl-space-1)',
  paddingBottom: 'var(--cl-space-4)',
  borderBottom: '1px solid var(--cl-border-muted)',
  fontFamily: 'var(--cl-font-display)',
  color: 'var(--cl-state-live)',
};

const metaStyle: React.CSSProperties = {
  color: 'var(--cl-text-muted)',
  fontFamily: 'var(--cl-font-mono)',
  fontSize: '0.75rem',
};

const navListStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 'var(--cl-space-4) 0 0',
  padding: 0,
  display: 'grid',
  gap: 'var(--cl-space-2)',
};

const navLinkStyle: React.CSSProperties = {
  display: 'block',
  padding: 'var(--cl-space-3)',
  color: 'var(--cl-text-secondary)',
  textDecoration: 'none',
  fontFamily: 'var(--cl-font-mono)',
  textTransform: 'uppercase',
  fontSize: '0.75rem',
};

const navLinkActiveStyle: React.CSSProperties = {
  background: 'var(--cl-state-live)',
  color: 'var(--cl-surface-base)',
};

const mainStyle: React.CSSProperties = {
  minWidth: 0,
  padding: 'var(--cl-space-8)',
};
