import { jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import { SectionTabList } from './section-tabs.js';

const tabs = [
  { id: 'general', label: 'General' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'scoring', label: 'Scoring' },
];

describe('SectionTabList', () => {
  it('marks the current tab and keeps only it in the tab order', () => {
    render(
      <SectionTabList
        ariaLabel="Sections"
        currentTabId="privacy"
        idPrefix="t"
        onSelect={() => {}}
        tabs={tabs}
      />,
    );

    const [general, privacy] = screen.getAllByRole('tab');
    expect(privacy?.getAttribute('aria-selected')).toBe('true');
    expect(privacy?.getAttribute('tabindex')).toBe('0');
    expect(general?.getAttribute('tabindex')).toBe('-1');
    expect(privacy?.getAttribute('id')).toBe('t-privacy-tab');
    expect(privacy?.getAttribute('aria-controls')).toBe('t-privacy-panel');
  });

  it('selects on click and moves selection and focus with the arrow, Home and End keys', () => {
    const onSelect = jest.fn();
    render(
      <SectionTabList
        ariaLabel="Sections"
        currentTabId="general"
        idPrefix="t"
        onSelect={onSelect}
        tabs={tabs}
      />,
    );
    const list = screen.getByRole('tablist');

    fireEvent.click(screen.getByRole('tab', { name: 'Scoring' }));
    expect(onSelect).toHaveBeenLastCalledWith('scoring');

    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(onSelect).toHaveBeenLastCalledWith('privacy');
    fireEvent.keyDown(list, { key: 'ArrowLeft' });
    expect(onSelect).toHaveBeenLastCalledWith('scoring');
    fireEvent.keyDown(list, { key: 'End' });
    expect(onSelect).toHaveBeenLastCalledWith('scoring');
    fireEvent.keyDown(list, { key: 'Home' });
    expect(onSelect).toHaveBeenCalledTimes(4);
    onSelect.mockClear();
    fireEvent.keyDown(list, { key: 'Tab' });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
