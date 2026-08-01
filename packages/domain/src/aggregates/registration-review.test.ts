import { canDecide, planBulkReview, rosterEditable, statusFor } from './registration-review.js';

const REQUIRED = { requiresCheckIn: true, closesAt: '2026-08-01T18:00:00.000Z' };

describe('when a roster stops being editable', () => {
  it('locks a checked-in entrant once the window closes', () => {
    const result = rosterEditable(REQUIRED, 'checked-in', '2026-08-01T19:00:00.000Z');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('the one that plays');
  });

  it('leaves it editable before the window closes', () => {
    expect(rosterEditable(REQUIRED, 'checked-in', '2026-08-01T17:00:00.000Z').ok).toBe(true);
  });

  it('never locks a tournament that asked for no check-in', () => {
    // CopaLibre enforces what this organizer configured, not what a
    // competition usually does.
    expect(
      rosterEditable({ requiresCheckIn: false }, 'checked-in', '2027-01-01T00:00:00Z').ok,
    ).toBe(true);
  });

  it('never locks an entrant who has not checked in', () => {
    expect(rosterEditable(REQUIRED, 'accepted', '2026-08-01T19:00:00.000Z').ok).toBe(true);
  });

  it('never locks when no closing instant was set', () => {
    expect(rosterEditable({ requiresCheckIn: true }, 'checked-in', '2027-01-01T00:00:00Z').ok).toBe(
      true,
    );
  });
});

describe('deciding a registration', () => {
  it('lets an organizer change their mind', () => {
    expect(canDecide('refused', 'accepted').ok).toBe(true);
    expect(canDecide('accepted', 'refused').ok).toBe(true);
    expect(statusFor('accepted')).toBe('accepted');
  });

  it('refuses to override a withdrawal', () => {
    // Overriding it puts somebody in a competition they left.
    const result = canDecide('withdrawn', 'accepted');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('only they can undo that');
  });

  it('lets a withdrawal be recorded again, which changes nothing', () => {
    expect(canDecide('withdrawn', 'withdrawn').ok).toBe(true);
  });
});

describe('a bulk action is a list of single decisions', () => {
  const entrants = [
    { entrantId: 'e-1', status: 'pending' as const },
    { entrantId: 'e-2', status: 'pending' as const },
    { entrantId: 'e-3', status: 'withdrawn' as const },
    { entrantId: 'e-4', status: 'pending' as const },
  ];

  it('applies to exactly what was selected', () => {
    const plan = planBulkReview(entrants, ['e-1', 'e-2'], 'accepted');

    expect(plan.apply.map((one) => one.entrantId)).toEqual(['e-1', 'e-2']);
    expect(plan.refused).toEqual([]);
  });

  it('reports the ones it will not touch, rather than silently skipping them', () => {
    // "Approved 40" is not an answer to "why is this team in the draw".
    const plan = planBulkReview(entrants, ['e-1', 'e-3'], 'accepted');

    expect(plan.apply).toHaveLength(1);
    expect(plan.refused[0]?.entrantId).toBe('e-3');
    expect(plan.refused[0]?.reason).toContain('withdrew');
  });

  it('ignores an id that is not in the list', () => {
    expect(planBulkReview(entrants, ['nope'], 'accepted').apply).toEqual([]);
  });
});
