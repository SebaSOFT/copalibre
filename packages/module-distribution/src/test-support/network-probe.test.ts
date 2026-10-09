import { REQUIRE_NETWORK_VARIABLE, probeRemote } from './network-probe.js';

const URL = 'https://example.invalid/modules.git';

describe('probeRemote', () => {
  it('reports a reachable remote as available', async () => {
    await expect(probeRemote(URL, {}, async () => true)).resolves.toEqual({ available: true });
  });

  it('reports an unreachable remote with the reason to skip', async () => {
    await expect(probeRemote(URL, {}, async () => false)).resolves.toEqual({
      available: false,
      reason: `remote ${URL} is unreachable`,
    });
  });

  it('fails instead of skipping when the environment requires the network', async () => {
    await expect(
      probeRemote(URL, { [REQUIRE_NETWORK_VARIABLE]: '1' }, async () => false),
    ).rejects.toThrow(/unreachable.*requires the network tests to run/);
  });

  it('still reports a reachable remote when the network is required', async () => {
    await expect(
      probeRemote(URL, { [REQUIRE_NETWORK_VARIABLE]: '1' }, async () => true),
    ).resolves.toEqual({ available: true });
  });
});
