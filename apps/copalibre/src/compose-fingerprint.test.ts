import { readFileSync } from 'node:fs';
import { composeFingerprint, identifyCompose, normalizeCompose } from './compose-fingerprint.js';
import { RELEASED_COMPOSE_FINGERPRINTS } from './released-compose-fingerprints.js';
import { reconcileComposeContent } from './compose-reconciler.js';

const fixture = (version: string): string =>
  readFileSync(
    new URL(`../test/fixtures/released-compose/docker-compose.${version}.yml`, import.meta.url),
    'utf8',
  );
const shipped = readFileSync(new URL('../../../docker-compose.yml', import.meta.url), 'utf8');

describe('compose fingerprints', () => {
  it('recognise the file each release shipped', () => {
    for (const version of ['1.0.5', '1.2.0', '1.2.6']) {
      const origin = identifyCompose(fixture(version), shipped);
      expect(origin).toEqual({ kind: 'released', versions: expect.arrayContaining([version]) });
    }
  });

  it('agree with the generated table, so the script and the CLI normalise alike', () => {
    for (const version of ['1.0.5', '1.2.0', '1.2.6']) {
      expect(composeFingerprint(fixture(version))).toBe(RELEASED_COMPOSE_FINGERPRINTS[version]);
    }
  });

  it('cover every stable release from 1.0.1 to 1.2.6', () => {
    expect(Object.keys(RELEASED_COMPOSE_FINGERPRINTS)).toEqual(
      expect.arrayContaining(['1.0.1', '1.0.5', '1.1.0', '1.2.0', '1.2.1', '1.2.5', '1.2.6']),
    );
  });

  it('still recognise a file an earlier upgrade rewrote: image tags, version default, loopback ports', () => {
    const rewritten = reconcileComposeContent(fixture('1.2.6'), '2.0.0').content;
    expect(rewritten).not.toBe(fixture('1.2.6'));
    expect(identifyCompose(rewritten, shipped)).toEqual({
      kind: 'released',
      versions: ['1.2.6'],
    });
    const crlf = fixture('1.2.0').replace(/\n/g, '\r\n');
    expect(identifyCompose(crlf, shipped)).toEqual({
      kind: 'released',
      versions: ['1.2.0', '1.2.1'],
    });
  });

  it('call a file the operator edited modified', () => {
    const edited = fixture('1.2.6').replace('restart: unless-stopped', 'restart: always');
    expect(identifyCompose(edited, shipped)).toEqual({ kind: 'modified' });
    const added = `${fixture('1.2.6')}\n  my-backup:\n    image: alpine\n`;
    expect(identifyCompose(added, shipped)).toEqual({ kind: 'modified' });
  });

  it('call the file this CLI ships current', () => {
    expect(identifyCompose(shipped, shipped)).toEqual({ kind: 'current' });
  });

  it('normalise quoting of a port mapping and the trailing newlines', () => {
    expect(normalizeCompose('    ports:\n      - "127.0.0.1:3001:3001"\n\n\n')).toBe(
      '    ports:\n      - 3001:3001\n',
    );
  });
});
