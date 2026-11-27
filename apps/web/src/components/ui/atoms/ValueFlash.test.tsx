import { act, render } from '@testing-library/react';
import { jest } from '@jest/globals';
import { FLASH_DURATION_MS } from '../../../lib/value-flash.js';
import { ValueFlash } from './ValueFlash.js';

describe('ValueFlash', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('adds the flash class after a value change and removes it after one cycle', () => {
    const { container, rerender } = render(<ValueFlash value={1} />);
    const value = container.querySelector('span');
    expect(value?.classList.contains('cl-flash-on-change')).toBe(false);

    rerender(<ValueFlash value={2} />);
    act(() => jest.advanceTimersByTime(0));
    expect(value?.classList.contains('cl-flash-on-change')).toBe(true);

    act(() => jest.advanceTimersByTime(FLASH_DURATION_MS));
    expect(value?.classList.contains('cl-flash-on-change')).toBe(false);
  });
});
