import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { FormField } from './form-field.js';
import { DataEntityCard } from './data-entity-card.js';
import { TableToolbar } from './table-toolbar.js';
import { Pagination } from './pagination.js';
import { Input } from '../atoms/input.js';

describe('FormField (0141)', () => {
  it('renders identically whether it wraps an error or not, aside from the message', () => {
    const { container: withoutError } = render(
      <FormField id="a" label="Correo">
        <Input id="a" onChange={() => {}} value="" />
      </FormField>,
    );
    const { container: withError } = render(
      <FormField errorText="Requerido" id="b" label="Correo">
        <Input id="b" onChange={() => {}} value="" />
      </FormField>,
    );
    // Same structural shape: a label, the control, then an optional message slot.
    expect(withoutError.querySelectorAll('.cl-form-field > *').length).toBe(2);
    expect(withError.querySelectorAll('.cl-form-field > *').length).toBe(3);
  });

  it('shows the error message with role=alert, not the help text', () => {
    render(
      <FormField errorText="Requerido" helpText="Ayuda" id="c" label="Correo">
        <Input id="c" onChange={() => {}} value="" />
      </FormField>,
    );
    expect(screen.getByRole('alert').textContent).toBe('Requerido');
    expect(screen.queryByText('Ayuda')).toBeNull();
  });

  it('shows the help text when there is no error', () => {
    render(
      <FormField helpText="Ayuda" id="d" label="Correo">
        <Input id="d" onChange={() => {}} value="" />
      </FormField>,
    );
    expect(screen.getByText('Ayuda').className).toContain('cl-form-field__help');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders no message slot when there is neither an error nor help text', () => {
    const { container } = render(
      <FormField id="e" label="Correo">
        <Input id="e" onChange={() => {}} value="" />
      </FormField>,
    );
    expect(container.querySelectorAll('.cl-form-field > *').length).toBe(2);
  });
});

describe('DataEntityCard (0141)', () => {
  it('renders the same structural layout for two different entity kinds', () => {
    const { container: org } = render(
      <DataEntityCard
        badge={{ label: 'ACTIVA', state: 'state-positive' }}
        metadata={[{ label: 'Alias', value: 'liga-mendocina' }]}
        title="Liga Mendocina"
      />,
    );
    const { container: mod } = render(
      <DataEntityCard
        badge={{ label: 'DESACTUALIZADO', state: 'state-upcoming' }}
        metadata={[{ label: 'Versión', value: '2.1.0' }]}
        title="Módulo de fútbol 11"
      />,
    );
    expect(org.querySelector('.cl-card__title')).not.toBeNull();
    expect(mod.querySelector('.cl-card__title')).not.toBeNull();
    expect(org.querySelector('.cl-data-entity-card__metadata-item')).not.toBeNull();
    expect(mod.querySelector('.cl-data-entity-card__metadata-item')).not.toBeNull();
  });

  it('renders with no badge, no metadata and no actions', () => {
    const { container } = render(<DataEntityCard title="Sin badge" />);
    expect(container.querySelector('.cl-badge')).toBeNull();
    expect(container.querySelector('.cl-data-entity-card__metadata')).toBeNull();
    expect(container.querySelector('.cl-card__footer')).toBeNull();
    expect(screen.getByText('Sin badge')).toBeDefined();
  });

  it('renders its actions slot in the footer', () => {
    render(<DataEntityCard actions={<button type="button">Ver</button>} title="Con acciones" />);
    expect(screen.getByRole('button', { name: 'Ver' })).toBeDefined();
  });
});

describe('TableToolbar and Pagination (0141)', () => {
  it('renders a title, filter slot and actions slot', () => {
    render(
      <TableToolbar actions={<button type="button">Nuevo</button>} title="Roles">
        <input aria-label="Buscar" />
      </TableToolbar>,
    );
    expect(screen.getByText('Roles')).toBeDefined();
    expect(screen.getByLabelText('Buscar')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Nuevo' })).toBeDefined();
  });

  it('renders with no title, no filter slot and no actions', () => {
    const { container } = render(<TableToolbar />);
    expect(container.querySelector('.cl-table-toolbar__title')).toBeNull();
    expect(container.querySelector('.cl-table-toolbar__filters')).toBeNull();
    expect(container.querySelector('.cl-table-toolbar__actions')).toBeNull();
  });

  it('disables previous on the first page and next on the last', () => {
    render(<Pagination onPageChange={() => {}} page={1} pageCount={3} />);
    expect((screen.getByRole('button', { name: 'Previous' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('disables next on the last page and calls onPageChange with the target page', () => {
    const onPageChange = jest.fn();
    render(<Pagination onPageChange={onPageChange} page={3} pageCount={3} />);
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('accepts custom previous/next labels', () => {
    render(
      <Pagination
        nextLabel="Siguiente"
        onPageChange={() => {}}
        page={2}
        pageCount={3}
        previousLabel="Anterior"
      />,
    );
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDefined();
  });
});

describe('governance rules (design.md Decision 7): molecules hold no state/data access', () => {
  const dir = dirname(fileURLToPath(import.meta.url));
  const sourceFiles = readdirSync(dir).filter(
    (file) => file.endsWith('.tsx') && !file.endsWith('.test.tsx'),
  );

  it.each(sourceFiles)('%s does not import api-client.js', (file) => {
    expect(readFileSync(join(dir, file), 'utf8')).not.toMatch(/api-client\.js/);
  });

  it.each(sourceFiles)('%s does not hardcode an external margin', (file) => {
    expect(readFileSync(join(dir, file), 'utf8')).not.toMatch(
      /\bmargin(?:-block|-inline)?(?:-start|-end)?\s*:/,
    );
  });
});
