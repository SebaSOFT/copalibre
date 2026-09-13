import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { ListScreenLayout } from './list-screen-layout.js';
import { FormScreenLayout } from './form-screen-layout.js';
import { MatchConsoleLayout } from './match-console-layout.js';
import { AuthScreenLayout } from './auth-screen-layout.js';

describe('ListScreenLayout', () => {
  it('renders the same layout structure for two different content sets', () => {
    const { container: a } = render(
      <ListScreenLayout listing={<p>Listado A</p>} title="Roles" toolbar={<div>Toolbar A</div>} />,
    );
    const { container: b } = render(
      <ListScreenLayout
        listing={<p>Listado B</p>}
        pagination={<div>Paginación B</div>}
        title="Módulos"
        toolbar={<div>Toolbar B</div>}
      />,
    );
    expect(a.querySelector('.cl-list-screen__header')).not.toBeNull();
    expect(a.querySelector('.cl-list-screen__toolbar')).not.toBeNull();
    expect(a.querySelector('.cl-list-screen__listing')).not.toBeNull();
    expect(b.querySelector('.cl-list-screen__header')).not.toBeNull();
    expect(b.querySelector('.cl-list-screen__toolbar')).not.toBeNull();
    expect(b.querySelector('.cl-list-screen__listing')).not.toBeNull();
    expect(b.querySelector('.cl-list-screen__pagination')).not.toBeNull();
  });

  it('renders supplied content, not example placeholder content', () => {
    render(<ListScreenLayout listing={<p>Listado</p>} title="Roles" />);
    expect(screen.getByText('Roles')).toBeDefined();
    expect(screen.getByText('Listado')).toBeDefined();
  });
});

describe('FormScreenLayout', () => {
  it('renders one section per entry, in order, with a sticky footer', () => {
    render(
      <FormScreenLayout
        breadcrumb="Instalación"
        footer={<button type="submit">Guardar</button>}
        sections={[
          { key: 'a', heading: 'Datos', fields: <p>Campo A</p> },
          { key: 'b', heading: 'Roles', fields: <p>Campo B</p> },
        ]}
        title="Nueva organización"
      />,
    );
    const headings = screen.getAllByRole('heading', { level: 2 }).map((el) => el.textContent);
    expect(headings).toEqual(['Datos', 'Roles']);
    expect(screen.getByText('Instalación')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDefined();
  });

  it('renders with no breadcrumb and a headingless section', () => {
    const { container } = render(
      <FormScreenLayout
        footer={<button type="submit">Guardar</button>}
        sections={[{ key: 'a', fields: <p>Campo A</p> }]}
        title="Nueva organización"
      />,
    );
    expect(container.querySelector('.cl-form-screen__breadcrumb')).toBeNull();
    expect(container.querySelector('.cl-form-screen__section-heading')).toBeNull();
  });
});

describe('MatchConsoleLayout', () => {
  it('renders header, workspace, primary and rail regions with template layout classes', () => {
    const { container } = render(
      <MatchConsoleLayout
        alerts={<div className="alert">Alerta</div>}
        breadcrumb="Torneo Apertura > Partido 1"
        primary={<div className="controls">Controles</div>}
        rail={<div className="ledger">Libro de eventos</div>}
        scoreboard={<div className="score">2 - 1</div>}
        status={<span>EN VIVO</span>}
        syncStatus={<span>EN LÍNEA</span>}
        title="Mendoza vs San Juan"
      />,
    );
    expect(container.querySelector('.cl-match-console-screen')).not.toBeNull();
    expect(container.querySelector('.cl-match-console-screen__header')).not.toBeNull();
    expect(container.querySelector('.cl-match-console-screen__scoreboard')).not.toBeNull();
    expect(container.querySelector('.cl-match-console-screen__workspace')).not.toBeNull();
    expect(container.querySelector('.cl-match-console-screen__primary')).not.toBeNull();
    expect(container.querySelector('.cl-match-console-screen__rail')).not.toBeNull();
    expect(screen.getByText('Mendoza vs San Juan')).toBeDefined();
    expect(screen.getByText('EN VIVO')).toBeDefined();
    expect(screen.getByText('2 - 1')).toBeDefined();
  });
});

describe('AuthScreenLayout', () => {
  it('gives every unauthenticated screen the same brand header and one centred panel', () => {
    const { container: login } = render(
      <AuthScreenLayout tagline="Control de torneos">
        <p>Ingresá para operar</p>
      </AuthScreenLayout>,
    );
    const { container: invitation } = render(
      <AuthScreenLayout tagline="Control de torneos">
        <p>Aceptar invitación</p>
      </AuthScreenLayout>,
    );

    for (const container of [login, invitation]) {
      expect(container.querySelector('.cl-auth-screen')).not.toBeNull();
      expect(container.querySelector('.cl-auth-screen__header')).not.toBeNull();
      expect(container.querySelector('.cl-auth-screen__panel')).not.toBeNull();
    }
    expect(screen.getByText('Ingresá para operar')).toBeDefined();
    expect(screen.getByText('Aceptar invitación')).toBeDefined();
  });

  it('owns the page gutter, so no screen inside it sets its own', () => {
    // The invitation screen ran flush to both mobile edges precisely because it
    // centred its own card in a bare <body> instead of composing this template.
    const cssPath = join(
      dirname(fileURLToPath(import.meta.url)),
      '../../../../../../../packages/design-tokens/src/generate/css.ts',
    );
    const css = readFileSync(cssPath, 'utf8');
    expect(css).toContain('.cl-auth-screen { display: grid;');
    expect(css).toContain('padding: clamp(24px, 5vw, 64px)');
  });

  it("renders its brand mark as decorative, never as the screen's only heading", () => {
    const { container } = render(
      <AuthScreenLayout tagline="Control de torneos">
        <h1>Aceptar invitación</h1>
      </AuthScreenLayout>,
    );
    expect(container.querySelector('.cl-auth-screen__mark')?.getAttribute('alt')).toBe('');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Aceptar invitación');
  });
});

describe('governance rules (design.md Decision 7): templates hold no state/data access', () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const sourceFiles = readdirSync(dir).filter(
    (file) => file.endsWith('.tsx') && !file.endsWith('.test.tsx'),
  );

  it.each(sourceFiles)('%s does not import api-client.js', (file) => {
    expect(readFileSync(join(dir, file), 'utf8')).not.toMatch(/api-client\.js/);
  });
});
