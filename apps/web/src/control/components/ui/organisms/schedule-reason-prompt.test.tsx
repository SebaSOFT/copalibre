import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import { withIntl } from '../../../i18n/test-support.js';
import { ScheduleReasonPrompt, type ReasonPromptResult } from './schedule-reason-prompt.js';

const ROWS = [
  { matchId: 'm1', label: 'Alfa vs Bravo', change: '14:30 → 18:00' },
  { matchId: 'm2', label: 'Charlie vs Delta', change: '16:00 → 19:30' },
  { matchId: 'm3', label: 'Echo vs Foxtrot', change: '10:00 → withdrawn' },
];
const PRESETS = [
  { code: 'venue-unavailable', label: 'Venue unavailable' },
  { code: 'weather', label: 'Weather' },
];

function renderPrompt(recent: readonly string[] = []) {
  const onPublish = jest.fn<(result: ReasonPromptResult) => void>();
  render(
    withIntl(
      <ScheduleReasonPrompt
        onOpenChange={() => undefined}
        onPublish={onPublish}
        open
        presets={PRESETS}
        recent={recent}
        rows={ROWS}
      />,
    ),
  );
  const publish = () => screen.getByRole('button', { name: 'Publish changes' });
  return { onPublish, publish };
}

const row = (label: string) => screen.getByRole('option', { name: new RegExp(label) });

describe('ScheduleReasonPrompt', () => {
  it('keeps publish disabled until every row is covered, then sends the batch reason', () => {
    const { onPublish, publish } = renderPrompt();
    expect(publish()).toHaveProperty('disabled', true);
    expect(screen.getByText('3 matches still need a reason')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Reason for this batch'), {
      target: { value: 'Court 1 without lights' },
    });
    expect(screen.getByText('3 matches · 3 with batch reason · 0 exceptions')).toBeTruthy();
    fireEvent.click(publish());
    expect(onPublish).toHaveBeenCalledWith({
      batch: { text: 'Court 1 without lights' },
      exceptions: {},
    });
  });

  it('focuses the batch reason on open', () => {
    renderPrompt();
    expect(document.activeElement).toBe(screen.getByLabelText('Reason for this batch'));
  });

  it('gives one row its own reason with one action, already focused', () => {
    const { onPublish, publish } = renderPrompt();
    fireEvent.change(screen.getByLabelText('Reason for this batch'), {
      target: { value: 'Court 1 without lights' },
    });
    const toggles = screen.getAllByRole('button', { name: 'Different reason' });
    fireEvent.click(toggles[2] as HTMLElement);
    const own = screen.getByLabelText('Reason for Echo vs Foxtrot');
    expect(document.activeElement).toBe(own);
    expect(publish()).toHaveProperty('disabled', true);

    fireEvent.change(own, { target: { value: 'Requested by the visiting club' } });
    expect(screen.getByText('3 matches · 2 with batch reason · 1 exception')).toBeTruthy();
    fireEvent.click(publish());
    expect(onPublish).toHaveBeenCalledWith({
      batch: { text: 'Court 1 without lights' },
      exceptions: { m3: { text: 'Requested by the visiting club' } },
    });
  });

  it('lets several selected rows share one exception, with shift-click extending the selection', () => {
    const { onPublish, publish } = renderPrompt();
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0] as HTMLElement);
    fireEvent.click(checkboxes[2] as HTMLElement, { shiftKey: true });
    fireEvent.click(screen.getByRole('button', { name: 'Mark selected as exception' }));

    const shared = screen.getByLabelText('Reason for the 3 selected matches');
    fireEvent.change(shared, { target: { value: 'Weather' } });
    fireEvent.click(publish());
    const weather = { code: 'weather', text: 'Weather' };
    expect(onPublish).toHaveBeenCalledWith({
      exceptions: { m1: weather, m2: weather, m3: weather },
    });
  });

  it('stores a preset with its code and typed text without one, and offers recent reasons', () => {
    const { onPublish, publish } = renderPrompt(['Cancha 1 sin luz']);
    const batch = screen.getByLabelText('Reason for this batch');
    fireEvent.focus(batch);
    expect(screen.getByRole('option', { name: 'Cancha 1 sin luz' })).toBeTruthy();
    fireEvent.change(batch, { target: { value: 'ven' } });
    expect(screen.queryByRole('option', { name: 'Weather' })).toBeNull();
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Venue unavailable' }));
    fireEvent.click(publish());
    expect(onPublish).toHaveBeenLastCalledWith({
      batch: { code: 'venue-unavailable', text: 'Venue unavailable' },
      exceptions: {},
    });
  });

  it('works from the keyboard alone', () => {
    const { onPublish } = renderPrompt();
    const batch = screen.getByLabelText('Reason for this batch');
    fireEvent.change(batch, { target: { value: 'Court 1 without lights' } });

    const first = row('Alfa vs Bravo');
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    const second = row('Charlie vs Delta');
    expect(document.activeElement).toBe(second);
    fireEvent.keyDown(second, { key: ' ' });
    expect(second.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(second, { key: 'e' });
    const shared = screen.getByLabelText('Reason for Charlie vs Delta');
    expect(document.activeElement).toBe(shared);
    fireEvent.change(shared, { target: { value: 'Broadcast slot' } });

    fireEvent.keyDown(row('Alfa vs Bravo'), { key: 'Enter' });
    expect(onPublish).toHaveBeenCalledWith({
      batch: { text: 'Court 1 without lights' },
      exceptions: { m2: { text: 'Broadcast slot' } },
    });
  });

  it('publishes on Enter from a reason field once every row is covered', () => {
    const { onPublish } = renderPrompt();
    const batch = screen.getByLabelText('Reason for this batch');
    fireEvent.keyDown(batch, { key: 'Enter' });
    expect(onPublish).not.toHaveBeenCalled();
    fireEvent.change(batch, { target: { value: 'Weather' } });
    fireEvent.keyDown(batch, { key: 'Enter' });
    expect(onPublish).toHaveBeenCalledWith({
      batch: { code: 'weather', text: 'Weather' },
      exceptions: {},
    });
  });
});
