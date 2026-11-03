import { fireEvent, render, screen, within } from '@testing-library/react';
import { jest } from '@jest/globals';
import { Modal } from './modal.js';

describe('Modal', () => {
  it('names its close control from the caller’s label and dismisses through it', () => {
    const onOpenChange = jest.fn();
    render(
      <Modal closeLabel="Cerrar" onOpenChange={onOpenChange} open title="Confirmar">
        <p>Contenido</p>
      </Modal>,
    );

    const dialog = within(screen.getByRole('dialog', { name: 'Confirmar' }));
    const close = dialog.getByRole('button', { name: 'Cerrar' });
    expect(close.getAttribute('aria-label')).toBe('Cerrar');

    fireEvent.click(close);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders nothing while closed', () => {
    render(
      <Modal closeLabel="Close" onOpenChange={() => undefined} open={false} title="Hidden">
        <p>Body</p>
      </Modal>,
    );

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
