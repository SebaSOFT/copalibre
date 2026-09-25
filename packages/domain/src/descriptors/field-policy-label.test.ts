import { humanizeFieldPath, resolveFieldPolicyLabel } from './field-policy-label.js';
import type { FieldPolicy } from './override-policy.js';

describe('humanizeFieldPath', () => {
  it('title-cases each dot-separated segment and joins with ›', () => {
    expect(humanizeFieldPath('scoring.pointsPerWin')).toBe('Scoring › Points Per Win');
  });

  it('splits snake_case and kebab-case words within a segment', () => {
    expect(humanizeFieldPath('match_state.max-overtime')).toBe('Match State › Max Overtime');
  });

  it('handles a single-segment path', () => {
    expect(humanizeFieldPath('winCondition')).toBe('Win Condition');
  });
});

describe('resolveFieldPolicyLabel', () => {
  const basePolicy: FieldPolicy = { permission: { kind: 'replaced' }, mutationClass: 'safe' };

  it('uses the declared label when present', () => {
    const policy: FieldPolicy = { ...basePolicy, label: 'Points per win' };
    expect(resolveFieldPolicyLabel('scoring.pointsPerWin', policy, 'en')).toBe('Points per win');
  });

  it('resolves a localized label for the requested language', () => {
    const policy: FieldPolicy = {
      ...basePolicy,
      label: { en: 'Points per win', es: 'Puntos por victoria' },
    };
    expect(resolveFieldPolicyLabel('scoring.pointsPerWin', policy, 'es')).toBe(
      'Puntos por victoria',
    );
  });

  it('falls back to the humanized dot-path when no label is declared and the path is not standard', () => {
    expect(resolveFieldPolicyLabel('scoring.pointsPerDraw', basePolicy, 'en')).toBe(
      'Scoring › Points Per Draw',
    );
  });

  it('resolves a localized name for a standard dot-path when no label is declared (openspec 0285)', () => {
    expect(resolveFieldPolicyLabel('scoring.pointsPerWin', basePolicy, 'en')).toBe(
      'Points Per Win',
    );
    expect(resolveFieldPolicyLabel('scoring.pointsPerWin', basePolicy, 'es')).toBe(
      'Puntos Por Victoria',
    );
    expect(resolveFieldPolicyLabel('format', basePolicy, 'en')).toBe('Format');
    expect(resolveFieldPolicyLabel('segments', basePolicy, 'en')).toBe('Segments');
    expect(resolveFieldPolicyLabel('registration.capacity', basePolicy, 'en')).toBe(
      'Registration Capacity',
    );
  });

  it('a declared label still wins over a standard dot-path name', () => {
    const policy: FieldPolicy = { ...basePolicy, label: 'Custom points label' };
    expect(resolveFieldPolicyLabel('scoring.pointsPerWin', policy, 'en')).toBe(
      'Custom points label',
    );
  });

  it('falls back to English for a standard dot-path in a language it has no translation for', () => {
    expect(resolveFieldPolicyLabel('format', basePolicy, 'zh')).toBe('Format');
  });
});
