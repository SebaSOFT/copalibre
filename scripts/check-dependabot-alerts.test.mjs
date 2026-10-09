import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  checkDependabotAlerts,
  checkManifestResolutionFloor,
  checkPatchedFloor,
  compareStableVersions,
  inspectOpenAlerts,
  KNOWN_UNPATCHED_ADVISORIES,
  lockVersions,
} from './check-dependabot-alerts.mjs';

const lock = `
"braces@npm:^3.0.3":
  version: 3.0.3
  resolution: "braces@npm:3.0.3"
"http-cache-semantics@npm:^4.2.0":
  version: 4.2.0
  resolution: "http-cache-semantics@npm:4.2.0"
`;

test('the unpatched advisory register records exact package, GHSA and exposure context', () => {
  assert.deepEqual(Object.keys(KNOWN_UNPATCHED_ADVISORIES), ['71', '72']);
  assert.equal(KNOWN_UNPATCHED_ADVISORIES[71].package, 'braces');
  assert.equal(KNOWN_UNPATCHED_ADVISORIES[72].package, 'http-cache-semantics');
  for (const entry of Object.values(KNOWN_UNPATCHED_ADVISORIES)) {
    assert.match(entry.dependencyPath, / -> /);
    assert.match(entry.runtimeExposure, /^none;/);
    assert.match(entry.upstreamIssue, /^https:\/\/github\.com\//);
  }
});

test('open alerts pass only when their alert number, package and GHSA match the register', () => {
  const { failures, reviewed } = inspectOpenAlerts([
    {
      number: 71,
      security_vulnerability: { package: { name: 'braces' } },
      security_advisory: { ghsa_id: 'GHSA-vfj7-8cjw-p6xm' },
    },
  ]);
  assert.deepEqual(failures, []);
  assert.deepEqual(reviewed, [{ number: 71, packageName: 'braces', ghsa: 'GHSA-vfj7-8cjw-p6xm' }]);
});

test('unknown or changed alerts fail with actionable identity details', () => {
  const result = inspectOpenAlerts([
    {
      number: 999,
      security_vulnerability: { package: { name: 'new-package' } },
      security_advisory: { ghsa_id: 'GHSA-new' },
    },
    {
      number: 71,
      security_vulnerability: { package: { name: 'braces' } },
      security_advisory: { ghsa_id: 'GHSA-changed' },
    },
  ]);
  assert.equal(result.failures.length, 2);
  assert.match(result.failures[0], /#999.*new-package.*GHSA-new/);
  assert.match(result.failures[1], /#71.*expected braces\/GHSA-vfj7-8cjw-p6xm/);
});

test('patched floors reject affected lock versions until all instances are upgraded', () => {
  assert.deepEqual(checkPatchedFloor('braces', ['3.0.3'], '3.0.4'), [
    'braces: locked 3.0.3 is below upstream patched version 3.0.4; update package.json resolutions',
  ]);
  assert.deepEqual(checkPatchedFloor('braces', ['3.0.4', '3.1.0'], '3.0.4'), []);
  assert.deepEqual(checkPatchedFloor('braces', ['3.0.3'], null), []);
  assert.equal(compareStableVersions('4.2.10', '4.2.9'), 1);
});

test('a published fix requires an explicit root resolution at or above its floor', () => {
  assert.deepEqual(checkManifestResolutionFloor('braces', {}, '3.0.4'), [
    'braces: package.json resolutions has no explicit pin for upstream patched version 3.0.4',
  ]);
  assert.deepEqual(
    checkManifestResolutionFloor('braces', { 'braces@npm:^3.0.3': '3.0.4' }, '3.0.4'),
    [],
  );
  assert.deepEqual(
    checkManifestResolutionFloor('braces', { 'braces@npm:^3.0.3': '3.0.3' }, '3.0.4'),
    [
      'braces@npm:^3.0.3: braces: locked 3.0.3 is below upstream patched version 3.0.4; update package.json resolutions',
    ],
  );
});

test('the lockfile reader finds every tracked package instance', () => {
  assert.deepEqual(lockVersions(lock, 'braces'), ['3.0.3']);
  assert.deepEqual(lockVersions(lock, 'http-cache-semantics'), ['4.2.0']);
});

test('the API audit fails unknown alerts and detects a patch below current lock versions', async () => {
  const responses = [
    [
      {
        number: 71,
        security_vulnerability: { package: { name: 'braces' } },
        security_advisory: { ghsa_id: 'GHSA-vfj7-8cjw-p6xm' },
      },
    ],
    {
      vulnerabilities: [
        {
          package: { ecosystem: 'npm', name: 'braces' },
          first_patched_version: { identifier: '3.0.4' },
        },
      ],
    },
    {
      vulnerabilities: [
        {
          package: { ecosystem: 'npm', name: 'http-cache-semantics' },
          first_patched_version: null,
        },
      ],
    },
  ];
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => responses.shift(),
    text: async () => '',
  });
  await assert.rejects(
    checkDependabotAlerts({
      repository: 'SebaSOFT/copalibre',
      token: 'test-token',
      fetchImpl,
      lockText: lock,
    }),
    /braces: locked 3\.0\.3 is below upstream patched version 3\.0\.4/,
  );
});

test('the API audit follows GitHub Link pagination for Dependabot alerts', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes('/dependabot/alerts?')) {
      const secondPage = url.includes('cursor=next');
      return {
        ok: true,
        status: 200,
        headers: { get: () => (secondPage ? null : `<${url}&cursor=next>; rel="next"`) },
        json: async () =>
          secondPage
            ? [
                {
                  number: 71,
                  security_vulnerability: { package: { name: 'braces' } },
                  security_advisory: { ghsa_id: 'GHSA-vfj7-8cjw-p6xm' },
                },
              ]
            : Array.from({ length: 100 }, () => ({
                number: 71,
                security_vulnerability: { package: { name: 'braces' } },
                security_advisory: { ghsa_id: 'GHSA-vfj7-8cjw-p6xm' },
              })),
        text: async () => '',
      };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        vulnerabilities: [
          {
            package: { ecosystem: 'npm', name: 'braces' },
            first_patched_version: null,
          },
        ],
      }),
      text: async () => '',
    };
  };

  const result = await checkDependabotAlerts({
    repository: 'SebaSOFT/copalibre',
    token: 'test-token',
    fetchImpl,
    lockText: lock,
    known: {
      71: {
        package: 'braces',
        ghsa: 'GHSA-vfj7-8cjw-p6xm',
        dependencyPath: 'root -> braces',
        runtimeExposure: 'none; test fixture',
        upstreamIssue: 'https://github.com/micromatch/braces/issues/70',
      },
    },
  });

  assert.equal(result.openAlertCount, 101);
  assert.equal(calls.filter((url) => url.includes('/dependabot/alerts?')).length, 2);
  assert.match(calls[0], /per_page=100$/);
  assert.match(calls[1], /cursor=next$/);
});
