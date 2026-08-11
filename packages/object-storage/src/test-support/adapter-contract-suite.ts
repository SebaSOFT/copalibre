import type { ObjectStorageAdapter } from '../types.js';

/**
 * The behavior every profile SHALL provide identically (task 5.1) — run
 * against both the S3 and filesystem profiles so neither can silently
 * diverge from the shared adapter contract.
 */
export function describeObjectStorageAdapterContract(
  label: string,
  createAdapter: () => ObjectStorageAdapter | Promise<ObjectStorageAdapter>,
): void {
  describe(`ObjectStorageAdapter contract (${label})`, () => {
    let adapter: ObjectStorageAdapter;

    beforeEach(async () => {
      adapter = await createAdapter();
    });

    it('retrieves exactly what was stored', async () => {
      const body = new TextEncoder().encode('hello object storage');
      const reference = await adapter.put('greetings/hello.txt', body, 'text/plain');

      const stored = await adapter.get(reference);
      expect(new TextDecoder().decode(stored.body)).toBe('hello object storage');
    });

    it('keeps two different keys independent', async () => {
      const a = await adapter.put('a.txt', new TextEncoder().encode('A'), 'text/plain');
      const b = await adapter.put('b.txt', new TextEncoder().encode('B'), 'text/plain');

      expect(new TextDecoder().decode((await adapter.get(a)).body)).toBe('A');
      expect(new TextDecoder().decode((await adapter.get(b)).body)).toBe('B');
    });

    it('overwrites a key that already exists', async () => {
      const reference = await adapter.put(
        'overwrite.txt',
        new TextEncoder().encode('first'),
        'text/plain',
      );
      await adapter.put('overwrite.txt', new TextEncoder().encode('second'), 'text/plain');

      expect(new TextDecoder().decode((await adapter.get(reference)).body)).toBe('second');
    });

    it('removes an object on delete', async () => {
      const reference = await adapter.put(
        'to-delete.txt',
        new TextEncoder().encode('x'),
        'text/plain',
      );
      await adapter.delete(reference);

      await expect(adapter.get(reference)).rejects.toThrow();
    });

    it('reports its own profile', () => {
      expect(['s3', 'filesystem']).toContain(adapter.profile);
    });
  });
}
