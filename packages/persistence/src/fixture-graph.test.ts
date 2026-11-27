import { isPersistedGraph, sourceOf } from './fixture-graph.js';

describe('isPersistedGraph', () => {
  it('is true when every fixture of the zone carries a node key', () => {
    expect(isPersistedGraph([{ nodeKey: 'sf-1' }, { nodeKey: 'final' }])).toBe(true);
  });

  it('reads a zone without node keys as legacy', () => {
    expect(isPersistedGraph([{ nodeKey: null }, {}])).toBe(false);
  });

  it('reads a mixed zone as legacy', () => {
    expect(isPersistedGraph([{ nodeKey: 'sf-1' }, { nodeKey: null }])).toBe(false);
    expect(isPersistedGraph([{ nodeKey: 'sf-1' }, { nodeKey: undefined }])).toBe(false);
  });

  it('reads a zone with no fixtures as legacy', () => {
    expect(isPersistedGraph([])).toBe(false);
  });
});

describe('sourceOf', () => {
  it('parses JSON text and passes an already-parsed source through', () => {
    const source = { kind: 'winner-of', matchId: 'sf-1' } as const;
    expect(sourceOf(JSON.stringify(source))).toEqual(source);
    expect(sourceOf(source)).toEqual(source);
  });
});
