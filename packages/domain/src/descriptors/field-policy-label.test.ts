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

  it('falls back to the humanized dot-path when no label is declared', () => {
    expect(resolveFieldPolicyLabel('scoring.pointsPerWin', basePolicy, 'en')).toBe(
      'Scoring › Points Per Win',
    );
  });
});
