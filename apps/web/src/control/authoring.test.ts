import {
  canContinue,
  formatsFor,
  initialWizard,
  nextStep,
  previousStep,
  progress,
  stepProblems,
  toCreateRequest,
  type DisciplineOption,
  type WizardState,
} from './lib/wizard.js';
import {
  LOCK_EXPLANATION,
  initialReview,
  pageCount,
  teamMembershipActionsEnabled,
  setFilter,
  toggleAllVisible,
  toggleRow,
  visibleRows,
  type RegistrationRow,
} from './lib/review.js';
import { mutationFeedback } from './lib/mutation-feedback.js';

const DISCIPLINES: readonly DisciplineOption[] = [
  {
    descriptorId: 'd-football',
    version: '1.2.0',
    name: 'Fútbol 11',
    supportedFormats: ['single-elimination', 'round-robin'],
  },
  {
    descriptorId: 'd-swimming',
    version: '2.0.0',
    name: 'Natación',
    supportedFormats: ['placement'],
  },
];

function wizard(overrides: Partial<WizardState> = {}): WizardState {
  return { ...initialWizard(), ...overrides };
}

describe('the wizard gates each step', () => {
  it('will not leave the name step without a name and a valid alias', () => {
    expect(stepProblems(wizard(), DISCIPLINES)).toContain('Falta el nombre');
    expect(stepProblems(wizard({ name: 'Copa', alias: 'Copa Verano' }), DISCIPLINES)).toContain(
      'El alias va en minúscula, con guiones',
    );
    expect(canContinue(wizard({ name: 'Copa', alias: 'copa-verano' }), DISCIPLINES)).toBe(true);
  });

  it('will not leave the discipline step unchosen', () => {
    expect(canContinue(wizard({ step: 'discipline' }), DISCIPLINES)).toBe(false);
    expect(
      canContinue(wizard({ step: 'discipline', descriptorId: 'd-football' }), DISCIPLINES),
    ).toBe(true);
  });

  it('offers only the formats the chosen discipline declares', () => {
    // Never a client-side list: it disagrees with the installation the day a
    // module is added.
    expect(formatsFor(DISCIPLINES, 'd-football')).toEqual(['single-elimination', 'round-robin']);
    expect(formatsFor(DISCIPLINES, 'd-swimming')).toEqual(['placement']);
    expect(formatsFor(DISCIPLINES, 'unknown')).toEqual([]);
  });

  it('catches a format left over from a discipline the operator changed', () => {
    const stale = wizard({
      step: 'format',
      descriptorId: 'd-swimming',
      format: 'round-robin',
    });

    expect(stepProblems(stale, DISCIPLINES)).toEqual([
      'Ese formato no lo soporta la disciplina elegida',
    ]);
  });

  it('refuses a tournament nobody could play', () => {
    expect(stepProblems(wizard({ step: 'window', capacity: 1 }), DISCIPLINES)).toHaveLength(1);
    expect(canContinue(wizard({ step: 'window', capacity: 8 }), DISCIPLINES)).toBe(true);
    expect(canContinue(wizard({ step: 'window' }), DISCIPLINES)).toBe(true);
  });

  it('moves between steps and stops at the ends', () => {
    expect(nextStep(wizard())).toBe('discipline');
    expect(previousStep(wizard({ step: 'discipline' }))).toBe('name');
    expect(previousStep(wizard())).toBe('name');
    expect(nextStep(wizard({ step: 'window' }))).toBe('window');
    expect(progress(wizard())).toBe(25);
    expect(progress(wizard({ step: 'window' }))).toBe(100);
  });

  it('submits the descriptor version, which the ruleset freezes', () => {
    // A ruleset tracking "latest" would change under a tournament being played.
    const request = toCreateRequest(
      wizard({
        alias: 'copa-verano',
        name: 'Copa Verano',
        descriptorId: 'd-football',
        descriptorVersion: '1.2.0',
        format: 'round-robin',
        publicRegistration: true,
        requiresCheckIn: true,
      }),
    );

    expect(request).toEqual({
      alias: 'copa-verano',
      name: 'Copa Verano',
      descriptorId: 'd-football',
      descriptorVersion: '1.2.0',
      format: 'round-robin',
      publicRegistration: true,
      requiresCheckIn: true,
    });
  });

  it('refuses to submit an incomplete wizard', () => {
    expect(() => toCreateRequest(wizard())).toThrow('not complete');
  });
});

const ROWS: readonly RegistrationRow[] = [
  { entrantId: 'e-1', displayName: 'Talleres', status: 'pending', submittedAt: '2026-07-01' },
  { entrantId: 'e-2', displayName: 'Casa de Italia', status: 'pending', submittedAt: '2026-07-02' },
  { entrantId: 'e-3', displayName: 'San Martín', status: 'accepted', submittedAt: '2026-07-03' },
];

describe('the review table', () => {
  it('filters by status and resets to the first page', () => {
    const state = setFilter(initialReview(), 'pending', ROWS);

    expect(visibleRows(ROWS, state).map((row) => row.entrantId)).toEqual(['e-1', 'e-2']);
    expect(state.page).toBe(1);
  });

  it('drops a selection the new filter hides', () => {
    // "Approve selected" acting on rows nobody can see is the bulk action
    // nobody can explain afterwards.
    const selected = toggleRow(initialReview(), 'e-3');
    const filtered = setFilter(selected, 'pending', ROWS);

    expect(selected.selected).toEqual(['e-3']);
    expect(filtered.selected).toEqual([]);
  });

  it('selects and deselects one row', () => {
    const once = toggleRow(initialReview(), 'e-1');

    expect(once.selected).toEqual(['e-1']);
    expect(toggleRow(once, 'e-1').selected).toEqual([]);
  });

  it('selects everything visible, and only that', () => {
    const filtered = setFilter(initialReview(), 'pending', ROWS);
    const all = toggleAllVisible(filtered, ROWS);

    expect(all.selected).toEqual(['e-1', 'e-2']);
    expect(toggleAllVisible(all, ROWS).selected).toEqual([]);
  });

  it('paginates', () => {
    const small = { ...initialReview(2), page: 2 };

    expect(visibleRows(ROWS, small).map((row) => row.entrantId)).toEqual(['e-3']);
    expect(pageCount(ROWS, small)).toBe(2);
    expect(pageCount([], small)).toBe(1);
  });
});

describe('the eligibility lock, as the console shows it', () => {
  const closed = {
    requiresCheckIn: true,
    checkInClosesAt: '2026-08-01T18:00:00.000Z',
    status: 'checked-in' as const,
  };

  it('disables team-membership actions once check-in has closed', () => {
    expect(teamMembershipActionsEnabled({ ...closed, now: '2026-08-01T19:00:00.000Z' })).toBe(
      false,
    );
    expect(LOCK_EXPLANATION).toContain('membresías registradas');
  });

  it('leaves them enabled before it closes, and when nothing requires check-in', () => {
    expect(teamMembershipActionsEnabled({ ...closed, now: '2026-08-01T17:00:00.000Z' })).toBe(true);
    expect(
      teamMembershipActionsEnabled({
        requiresCheckIn: false,
        status: 'checked-in',
        now: '2030-01-01',
      }),
    ).toBe(true);
    expect(
      teamMembershipActionsEnabled({
        ...closed,
        status: 'accepted',
        now: '2026-08-01T19:00:00.000Z',
      }),
    ).toBe(true);
    expect(
      teamMembershipActionsEnabled({
        requiresCheckIn: true,
        status: 'checked-in',
        now: '2030-01-01',
      }),
    ).toBe(true);
  });
});

describe('mutation-classification feedback', () => {
  it('blocks result-sensitive edits once results exist', () => {
    expect(
      mutationFeedback({
        mutationClass: 'blocked_after_results',
        hasRecordedResults: true,
      }),
    ).toEqual({
      kind: 'blocked',
      message:
        'Este cambio ya no se puede aplicar desde edición normal: usá el flujo de corrección auditada.',
    });
  });

  it('warns for rebuild edits and stays silent for safe edits', () => {
    expect(
      mutationFeedback({
        mutationClass: 'requires_rebuild',
        hasRecordedResults: false,
        invalidatedFixtureCount: 3,
      }),
    ).toEqual({
      kind: 'warning',
      message: 'Este cambio requiere regenerar 3 fixtures.',
    });
    expect(mutationFeedback({ mutationClass: 'safe', hasRecordedResults: true })).toEqual({
      kind: 'none',
    });
  });
});
