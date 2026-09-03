import { jest } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import { NavigationDrawer } from './navigation-drawer.js';

describe('NavigationDrawer', () => {
  it('renders children and title when open', () => {
    const onOpenChange = jest.fn();
    render(
      <NavigationDrawer onOpenChange={onOpenChange} open={true} title="Menu Title">
        <p>Drawer Content</p>
      </NavigationDrawer>,
    );

    expect(screen.getByText('Menu Title')).toBeDefined();
    expect(screen.getByText('Drawer Content')).toBeDefined();

    const closeBtn = screen.getByRole('button', { name: 'Cerrar menú' });
    fireEvent.click(closeBtn);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not render children when closed', () => {
    const onOpenChange = jest.fn();
    render(
      <NavigationDrawer onOpenChange={onOpenChange} open={false} title="Menu Title">
        <p>Drawer Content</p>
      </NavigationDrawer>,
    );

    expect(screen.queryByText('Drawer Content')).toBeNull();
  });
});
