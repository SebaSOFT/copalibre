import { fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { DataTable } from './data-table.js';
import { Modal } from './modal.js';

interface Row {
  readonly id: string;
  readonly name: string;
}

describe('DataTable', () => {
  const rows: readonly Row[] = [
    { id: '1', name: 'Uno' },
    { id: '2', name: 'Dos' },
  ];
  const columns = [{ key: 'name', header: 'Nombre', render: (row: Row) => row.name }];

  it('renders one row per item and scopes column headers', () => {
    render(<DataTable columns={columns} rowKey={(row) => row.id} rows={rows} />);
    expect(screen.getByRole('columnheader', { name: 'Nombre' })).toBeDefined();
    expect(screen.getByText('Uno')).toBeDefined();
    expect(screen.getByText('Dos')).toBeDefined();
  });

  it('renders a caption when supplied', () => {
    render(<DataTable caption="Roles" columns={columns} rowKey={(row) => row.id} rows={rows} />);
    expect(screen.getByText('Roles').tagName.toLowerCase()).toBe('caption');
  });

  it('shows the empty message instead of an empty table when there are no rows', () => {
    render(
      <DataTable columns={columns} emptyMessage="Sin datos" rowKey={(row) => row.id} rows={[]} />,
    );
    expect(screen.getByText('Sin datos')).toBeDefined();
  });

  it('renders sortable header buttons and responds to click', () => {
    const onSort = jest.fn();
    const sortableColumns = [
      {
        key: 'name',
        header: (
          <button onClick={onSort} type="button">
            Nombre ▾
          </button>
        ),
        render: (row: Row) => row.name,
      },
    ];
    render(<DataTable columns={sortableColumns} rowKey={(row) => row.id} rows={rows} />);
    const button = screen.getByRole('button', { name: 'Nombre ▾' });
    expect(button).toBeDefined();
    fireEvent.click(button);
    expect(onSort).toHaveBeenCalledTimes(1);
  });

  it('renders expanded-row detail when renderRowDetail is provided', () => {
    render(
      <DataTable
        ariaLabel="Tabla de prueba"
        columns={columns}
        renderRowDetail={(row) => <div data-testid={`detail-${row.id}`}>Detalle de {row.name}</div>}
        rowKey={(row) => row.id}
        rows={rows}
      />,
    );
    expect(screen.getByRole('region', { name: 'Tabla de prueba' })).toBeDefined();
    expect(screen.getByTestId('detail-1')).toBeDefined();
    expect(screen.getByText('Detalle de Uno')).toBeDefined();
    expect(screen.getByTestId('detail-2')).toBeDefined();
    expect(screen.getByText('Detalle de Dos')).toBeDefined();
  });
});

describe('Modal', () => {
  it('renders its title and body when open, nothing when closed', () => {
    const { rerender } = render(
      <Modal onOpenChange={() => {}} open={false} title="Invitar">
        Contenido
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();

    rerender(
      <Modal onOpenChange={() => {}} open title="Invitar">
        Contenido
      </Modal>,
    );
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('Invitar')).toBeDefined();
    expect(screen.getByText('Contenido')).toBeDefined();
  });

  it('closes on Escape', () => {
    const onOpenChange = jest.fn();
    render(
      <Modal onOpenChange={onOpenChange} open title="Invitar">
        Contenido
      </Modal>,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', code: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes via its own close button', () => {
    const onOpenChange = jest.fn();
    render(
      <Modal onOpenChange={onOpenChange} open title="Invitar">
        Contenido
      </Modal>,
    );
    fireEvent.click(screen.getByRole('button', { name: '×' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders with no description and no footer', () => {
    render(
      <Modal onOpenChange={() => {}} open title="Invitar">
        Contenido
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelector('.cl-modal__description')).toBeNull();
    expect(dialog.querySelector('.cl-modal__footer')).toBeNull();
  });

  it('renders a description and footer when supplied', () => {
    render(
      <Modal
        description="Detalle"
        footer={<button type="button">Guardar</button>}
        onOpenChange={() => {}}
        open
        title="Invitar"
      >
        Contenido
      </Modal>,
    );
    expect(screen.getByText('Detalle')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDefined();
  });
});
