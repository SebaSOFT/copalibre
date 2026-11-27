import { messages } from '../../i18n/messages.en.js';
import { FILTERS, STATUS_LABELS } from './registration-review-model.js';

describe('registration review filters', () => {
  it('lists the all filter first, then the pending, accepted and refused statuses', () => {
    expect(FILTERS.map((filter) => filter.value)).toEqual([
      'all',
      'pending',
      'accepted',
      'refused',
    ]);
  });

  it('labels each filter with its own catalogue message', () => {
    expect(FILTERS.map((filter) => filter.label)).toEqual([
      messages.reviewFilterAll,
      messages.reviewFilterPending,
      messages.reviewFilterAccepted,
      messages.reviewFilterRefused,
    ]);
  });

  it('keys every status filter to a status label', () => {
    for (const filter of FILTERS.filter((entry) => entry.value !== 'all')) {
      expect(STATUS_LABELS).toHaveProperty(filter.value);
    }
  });
});

describe('registration review status labels', () => {
  it('has exactly one label for each registration status', () => {
    expect(Object.keys(STATUS_LABELS).sort()).toEqual([
      'accepted',
      'checked-in',
      'pending',
      'refused',
      'withdrawn',
    ]);
  });

  it('maps each status to its own catalogue message', () => {
    expect(STATUS_LABELS).toEqual({
      pending: messages.reviewStatusPending,
      accepted: messages.reviewStatusAccepted,
      refused: messages.reviewStatusRefused,
      withdrawn: messages.reviewStatusWithdrawn,
      'checked-in': messages.reviewStatusCheckedIn,
    });
  });

  it('gives every status a distinct message id', () => {
    const ids = Object.values(STATUS_LABELS).map((label) => label.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
