import { resolveAlias, type AliasRedirect } from './aliasing.js';

describe('a renamed alias', () => {
  const current = new Set(['clausura-2026']);
  const redirects: readonly AliasRedirect[] = [
    { organizationId: 'org-1', oldAlias: 'apertura-2026', newAlias: 'clausura-2026' },
    { organizationId: 'org-2', oldAlias: 'apertura-2026', newAlias: 'otra-cosa' },
  ];

  it('redirects permanently to the canonical alias', () => {
    // The old URL is on a poster, in a WhatsApp message and on a federation
    // page; 404 there is all three pointing at nothing.
    expect(resolveAlias('org-1', 'apertura-2026', current, redirects)).toEqual({
      kind: 'redirect',
      to: 'clausura-2026',
      status: 301,
    });
  });

  it('says nothing about a current alias', () => {
    expect(resolveAlias('org-1', 'clausura-2026', current, redirects)).toEqual({ kind: 'current' });
  });

  it('never resolves across organizations', () => {
    // Two organizations both used "apertura"; crossing them hands a spectator
    // somebody else's competition.
    expect(resolveAlias('org-3', 'apertura-2026', current, redirects)).toEqual({ kind: 'unknown' });
  });

  it('follows a chain of renames', () => {
    const chain: readonly AliasRedirect[] = [
      { organizationId: 'org-1', oldAlias: 'a', newAlias: 'b' },
      { organizationId: 'org-1', oldAlias: 'b', newAlias: 'c' },
    ];

    expect(resolveAlias('org-1', 'a', new Set(['c']), chain)).toMatchObject({ to: 'c' });
  });

  it('gives up on a cycle rather than looping', () => {
    const cycle: readonly AliasRedirect[] = [
      { organizationId: 'org-1', oldAlias: 'a', newAlias: 'b' },
      { organizationId: 'org-1', oldAlias: 'b', newAlias: 'a' },
    ];

    expect(resolveAlias('org-1', 'a', new Set(['z']), cycle)).toEqual({ kind: 'unknown' });
  });

  it('is unknown when nothing matches', () => {
    expect(resolveAlias('org-1', 'nunca-existio', current, redirects)).toEqual({ kind: 'unknown' });
  });
});
