import { act, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { Popover } from './Popover.js';

// React derives pointerenter and pointerleave from the native over and out events.
const pointer = (type: 'pointerEnter' | 'pointerLeave', target: Element, pointerType: string) => {
  const event = createEvent[type === 'pointerEnter' ? 'pointerOver' : 'pointerOut'](target);
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  fireEvent(target, event);
};

describe('Popover', () => {
  it('names its trigger and stays closed until asked', () => {
    render(<Popover triggerLabel="About GD">Goal difference</Popover>);
    expect(screen.getByRole('button', { name: 'About GD' })).not.toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens on click, names the surface, and leaves focus on the trigger', () => {
    render(<Popover triggerLabel="About GD">Goal difference</Popover>);
    const trigger = screen.getByRole('button', { name: 'About GD' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'About GD' }).textContent).toBe('Goal difference');
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on Escape and returns focus to the trigger', () => {
    render(<Popover triggerLabel="About GD">Goal difference</Popover>);
    const trigger = screen.getByRole('button', { name: 'About GD' });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('does not open on hover unless asked to', () => {
    render(<Popover triggerLabel="About GD">Goal difference</Popover>);
    pointer('pointerEnter', screen.getByRole('button'), 'mouse');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens under a mouse and closes shortly after it leaves', () => {
    jest.useFakeTimers();
    render(
      <Popover openOnHover triggerLabel="About GD">
        Goal difference
      </Popover>,
    );
    const trigger = screen.getByRole('button');
    pointer('pointerEnter', trigger, 'mouse');
    expect(screen.getByRole('dialog')).not.toBeNull();
    pointer('pointerLeave', trigger, 'mouse');
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    jest.useRealTimers();
  });

  it('ignores touch as hover, so a tap opens it once', () => {
    render(
      <Popover openOnHover triggerLabel="About GD">
        Goal difference
      </Popover>,
    );
    const trigger = screen.getByRole('button');
    pointer('pointerEnter', trigger, 'touch');
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).not.toBeNull();
  });

  it('stays open when a hover-opened popover is clicked, and survives the pointer leaving', () => {
    jest.useFakeTimers();
    render(
      <Popover openOnHover triggerLabel="About GD">
        Goal difference
      </Popover>,
    );
    const trigger = screen.getByRole('button');
    pointer('pointerEnter', trigger, 'mouse');
    fireEvent.click(trigger);
    pointer('pointerLeave', trigger, 'mouse');
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(screen.getByRole('dialog')).not.toBeNull();
    jest.useRealTimers();
  });

  it('shows a text trigger that names itself and opens the same surface', () => {
    render(
      <Popover triggerLabel="Aldo Cantoni" triggerText="Aldo Cantoni">
        Av. Central 100
      </Popover>,
    );
    const trigger = screen.getByRole('button', { name: 'Aldo Cantoni' });
    expect(trigger.textContent).toBe('Aldo Cantoni');
    expect(trigger.getAttribute('aria-label')).toBeNull();
    expect(trigger.classList.contains('cl-popover__trigger--text')).toBe(true);
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Aldo Cantoni' }).textContent).toBe(
      'Av. Central 100',
    );
  });
});
