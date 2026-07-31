import { classifyScheduleMutation } from './schedule-mutation.js';
import type { FixtureRef } from '../rulesets/mutation.js';

const affected: FixtureRef[] = [
  { fixtureId: 'f-1', stageId: 's-1', hasResult: false },
  { fixtureId: 'f-2', stageId: 's-1', hasResult: false },
];

describe('classifyScheduleMutation', () => {
  it('is safe while the schedule is a draft nobody has seen', () => {
    const decision = classifyScheduleMutation({ published: false });

    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.value).toEqual({ allowed: true, mutationClass: 'safe' });
  });

  it('stays safe on a draft even when other fixtures are published', () => {
    // Nothing downstream referenced *this* slot, so nothing downstream breaks.
    const decision = classifyScheduleMutation({
      published: false,
      affectedPublishedFixtures: affected,
    });

    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.value.mutationClass).toBe('safe');
  });

  it('requires a rebuild once the schedule was published, naming what moves', () => {
    const decision = classifyScheduleMutation({
      published: true,
      affectedPublishedFixtures: affected,
    });

    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.value).toEqual({
      allowed: true,
      mutationClass: 'requires_rebuild',
      // A spectator holding a time, a notification already sent and a
      // downstream view all referenced the old slot.
      invalidates: affected,
    });
  });

  it('requires a rebuild with an empty list rather than pretending to be safe', () => {
    const decision = classifyScheduleMutation({ published: true });

    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.value).toMatchObject({ mutationClass: 'requires_rebuild', invalidates: [] });
  });

  it('blocks a reschedule once the match has started', () => {
    const decision = classifyScheduleMutation({ published: true, matchStarted: true });

    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.error.code).toBe('MUTATION_BLOCKED_AFTER_RESULTS');
    expect(decision.error.message).toContain('audited correction workflow');
  });

  it('blocks a reschedule once the match has been played, and says why', () => {
    const decision = classifyScheduleMutation({ published: true, matchConcluded: true });

    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    // A played fixture has a time and a place as a fact, not as a plan.
    expect(decision.error.message).toContain('a record now');
  });

  it('blocks a played match even if its schedule was never published', () => {
    const decision = classifyScheduleMutation({ published: false, matchConcluded: true });

    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.error.details).toMatchObject({ matchConcluded: true });
  });

  it('speaks the same three classes as configuration mutations', () => {
    // A caller handling mutation decisions should not learn a second
    // vocabulary for the same three answers.
    const draft = classifyScheduleMutation({ published: false });
    const published = classifyScheduleMutation({ published: true });

    expect(draft.ok && draft.value.mutationClass).toBe('safe');
    expect(published.ok && published.value.mutationClass).toBe('requires_rebuild');
    expect(classifyScheduleMutation({ published: true, matchStarted: true }).ok).toBe(false);
  });
});
