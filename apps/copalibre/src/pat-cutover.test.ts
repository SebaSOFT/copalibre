import {
  parsePatCutoverOptions,
  patCutoverCompleteMessage,
  patCutoverDryRunMessage,
  requirePatCutoverConfirmation,
} from './pat-cutover.js';

describe('Personal Access Token security cutover options', () => {
  it('parses dry-run and confirmation modes', () => {
    expect(parsePatCutoverOptions(['--dry-run'])).toEqual({ dryRun: true, confirmed: false });
    expect(parsePatCutoverOptions(['--confirm'])).toEqual({ dryRun: false, confirmed: true });
  });

  it('rejects a destructive run without explicit confirmation', () => {
    expect(() => requirePatCutoverConfirmation(parsePatCutoverOptions([]))).toThrow(
      'requires --confirm',
    );
  });

  it('rejects mutually exclusive dry-run and confirmation flags', () => {
    expect(() => parsePatCutoverOptions(['--dry-run', '--confirm'])).toThrow(
      'either --dry-run or --confirm',
    );
  });

  it('formats aggregate-only output', () => {
    expect(patCutoverDryRunMessage(3)).toBe('Legacy PAT cutover dry run: 3 active token(s).');
    expect(patCutoverCompleteMessage(3)).toBe('Legacy PAT cutover complete: 3 token(s) revoked.');
  });
});
