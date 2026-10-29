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
"sprintf-js@npm:~1.0.2":
  version: 1.0.3
  resolution: "sprintf-js@npm:1.0.3"
`;

test('the unpatched advisory register records exact package, GHSA and exposure context', () => {
  assert.deepEqual(Object.keys(KNOWN_UNPATCHED_ADVISORIES), ['71', '73']);
  assert.equal(KNOWN_UNPATCHED_ADVISORIES[71].package, 'braces');
  assert.equal(KNOWN_UNPATCHED_ADVISORIES[73].package, 'sprintf-js');
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

test('open alerts with published fixes pass when current lock and root resolution are patched', () => {
  const alert = {
    number: 75,
    security_vulnerability: {
      package: { name: 'vite' },
      first_patched_version: { identifier: '8.1.6' },
    },
    security_advisory: { ghsa_id: 'GHSA-698v-4r3x-3vcv' },
  };
  const lockText = `
"vite@npm:^8.3.4":
  version: 8.3.4
  resolution: "vite@npm:8.3.4"
`;
  const result = inspectOpenAlerts(
    [alert],
    {},
    {
      lockText,
      resolutions: { 'vite@npm:^8.3.4': '8.3.4' },
    },
  );

  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.patchedInCheckout, [
    {
      number: 75,
      packageName: 'vite',
      ghsa: 'GHSA-698v-4r3x-3vcv',
      firstPatchedVersion: '8.1.6',
    },
  ]);
});

test('open alerts check only locked instances inside the advisory vulnerable range', () => {
  const alert = {
    number: 89,
    security_vulnerability: {
      package: { name: 'fast-uri' },
      vulnerable_version_range: '>= 4.0.1, < 4.2.3',
      first_patched_version: { identifier: '4.2.3' },
    },
    security_advisory: { ghsa_id: 'GHSA-wjr9-j795-jxcr' },
  };
  const lockText = `
"fast-uri@npm:^3.0.0":
  version: 3.1.9
  resolution: "fast-uri@npm:3.1.9"
"fast-uri@npm:^4.0.0":
  version: 4.2.3
  resolution: "fast-uri@npm:4.2.3"
`;
  const resolutions = {
    'fast-uri@npm:^3.0.0': '3.1.9',
    'fast-uri@npm:^4.0.0': '4.2.3',
  };

  const patched = inspectOpenAlerts([alert], {}, { lockText, resolutions });
  assert.deepEqual(patched.failures, []);
  assert.deepEqual(patched.patchedInCheckout, [
    {
      number: 89,
      packageName: 'fast-uri',
      ghsa: 'GHSA-wjr9-j795-jxcr',
      firstPatchedVersion: '4.2.3',
    },
  ]);

  const vulnerableLock = lockText.replaceAll('4.2.3', '4.2.2');
  const vulnerable = inspectOpenAlerts(
    [alert],
    {},
    {
      lockText: vulnerableLock,
      resolutions: { ...resolutions, 'fast-uri@npm:^4.0.0': '4.2.2' },
    },
  );
  assert.equal(vulnerable.failures.length, 2);
  assert.match(
    vulnerable.failures[0],
    /fast-uri: locked 4\.2\.2 is below upstream patched version 4\.2\.3/,
  );
  assert.match(
    vulnerable.failures[1],
    /fast-uri@npm:\^4\.0\.0: fast-uri: locked 4\.2\.2 is below upstream patched version 4\.2\.3/,
  );
});

test('open alerts with published fixes still fail when the current checkout is vulnerable', () => {
  const alert = {
    number: 75,
    security_vulnerability: {
      package: { name: 'vite' },
      first_patched_version: { identifier: '8.1.6' },
    },
    security_advisory: { ghsa_id: 'GHSA-698v-4r3x-3vcv' },
  };
  const lockText = `
"vite@npm:^8.1.5":
  version: 8.1.5
  resolution: "vite@npm:8.1.5"
`;
  const result = inspectOpenAlerts(
    [alert],
    {},
    {
      lockText,
      resolutions: { 'vite@npm:^8.1.5': '8.1.5' },
    },
  );

  assert.equal(result.patchedInCheckout.length, 0);
  assert.equal(result.failures.length, 2);
  assert.match(
    result.failures[0],
    /vite: locked 8\.1\.5 is below upstream patched version 8\.1\.6/,
  );
  assert.match(
    result.failures[1],
    /vite@npm:\^8\.1\.5: vite: locked 8\.1\.5 is below upstream patched version 8\.1\.6/,
  );
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
  assert.deepEqual(lockVersions(lock, 'sprintf-js'), ['1.0.3']);
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
          package: { ecosystem: 'npm', name: 'sprintf-js' },
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
      // The responses above are scripted for these two entries, not for the whole register.
      known: {
        71: KNOWN_UNPATCHED_ADVISORIES[71],
        73: KNOWN_UNPATCHED_ADVISORIES[73],
      },
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
