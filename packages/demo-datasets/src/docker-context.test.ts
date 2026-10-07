import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

describe('production image contents', () => {
  it('keeps demo datasets and the scrape cache out of the Docker build context', async () => {
    const ignore = await readFile(
      fileURLToPath(new URL('../../../.dockerignore', import.meta.url)),
      'utf8',
    );
    const lines = ignore.split('\n').map((line) => line.trim());
    expect(lines).toContain('packages/demo-datasets/datasets');
    expect(lines).toContain('packages/demo-datasets/cache');
  });
});
