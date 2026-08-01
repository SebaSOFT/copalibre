type MutationClass = 'safe' | 'requires_rebuild' | 'blocked_after_results';

export type MutationFeedback =
  | { readonly kind: 'none' }
  | { readonly kind: 'warning'; readonly message: string }
  | { readonly kind: 'blocked'; readonly message: string };

export function mutationFeedback(input: {
  readonly mutationClass: MutationClass;
  readonly hasRecordedResults: boolean;
  readonly invalidatedFixtureCount?: number;
}): MutationFeedback {
  if (input.mutationClass === 'safe') return { kind: 'none' };

  if (input.mutationClass === 'blocked_after_results' && input.hasRecordedResults) {
    return {
      kind: 'blocked',
      message:
        'Este cambio ya no se puede aplicar desde edición normal: usá el flujo de corrección auditada.',
    };
  }

  if (input.mutationClass === 'requires_rebuild') {
    const count = input.invalidatedFixtureCount ?? 0;
    return {
      kind: 'warning',
      message:
        count === 0
          ? 'Este cambio requiere regenerar estructura competitiva.'
          : `Este cambio requiere regenerar ${count} fixture${count === 1 ? '' : 's'}.`,
    };
  }

  return { kind: 'none' };
}
