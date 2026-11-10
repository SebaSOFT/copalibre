import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildInventory,
  checkDependabotAlerts,
  checkManifestResolutionFloor,
  checkPatchedFloor,
  compareStableVersions,
  inspectOpenAlerts,
  KNOWN_UNPATCHED_ADVISORIES,
  lockVersions,
  REVIEWED_REMOVALS,
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

/** An alert as GitHub's API returns it, with a published fix. */
function fixedAlert(number, name, firstPatched, range, extra = {}) {
  return {
    number,
    state: 'open',
    security_vulnerability: {
      package: { name },
      first_patched_version: { identifier: firstPatched },
      vulnerable_version_range: range,
    },
    security_advisory: { ghsa_id: `GHSA-${name}-${number}`, severity: 'high' },
    dependency: { manifest_path: 'yarn.lock', scope: 'runtime', relationship: 'transitive' },
    ...extra,
  };
}

function lockOf(entries) {
  return entries
    .map(
      ([selector, name, version]) =>
        `"${selector}":\n  version: ${version}\n  resolution: "${name}@npm:${version}"`,
    )
    .join('\n');
}

test('a newly disclosed advisory absent from any earlier snapshot fails while the checkout is vulnerable', () => {
  const result = inspectOpenAlerts(
    [fixedAlert(500, 'left-pad', '1.3.1', '< 1.3.1')],
    {},
    {
      lockText: lockOf([['left-pad@npm:^1.0.0', 'left-pad', '1.3.0']]),
      resolutions: { 'left-pad': '1.3.0' },
    },
  );
  assert.ok(result.failures.some((failure) => /left-pad: locked 1\.3\.0 is below/.test(failure)));
  assert.equal(result.classified[0].classification, 'vulnerable-in-checkout');
});

test('mixed majors: an unpatched second line is caught even when the first line is fixed', () => {
  const lockText = lockOf([
    ['undici@npm:^6.0.0', 'undici', '6.29.1'],
    ['undici@npm:^8.0.0', 'undici', '8.12.1'],
  ]);
  const result = inspectOpenAlerts(
    [
      fixedAlert(501, 'undici', '6.29.1', '< 6.29.1'),
      fixedAlert(502, 'undici', '8.12.2', '>= 7.0.0, < 8.12.2'),
    ],
    {},
    {
      lockText,
      resolutions: { 'undici@npm:^6.0.0': '6.29.1', 'undici@npm:^8.0.0': '8.12.1' },
    },
  );
  assert.deepEqual(
    result.classified.map((entry) => entry.classification),
    ['patched-in-checkout', 'vulnerable-in-checkout'],
  );
  assert.ok(
    result.failures.some((failure) =>
      /8\.12\.1 is below upstream patched version 8\.12\.2/.test(failure),
    ),
  );
});

test('default-branch lag: an alert still open on main is patched in the checkout, never closed', () => {
  const alert = fixedAlert(503, 'zod', '4.6.6', '< 4.6.6');
  const { classified } = inspectOpenAlerts(
    [alert],
    {},
    {
      lockText: lockOf([['zod@npm:^4.0.0', 'zod', '4.6.7']]),
      resolutions: { zod: '4.6.7' },
    },
  );
  const inventory = buildInventory({
    alerts: [alert],
    classified,
    sourceSha: 'source',
    mainSha: 'main',
    generatedAt: '2026-11-10T00:00:00.000Z',
  });
  assert.deepEqual(inventory.classificationCounts, { 'patched-in-checkout': 1 });
  assert.equal(inventory.alerts[0].githubState, 'open');
  assert.equal(inventory.alerts[0].classification, 'patched-in-checkout');
  assert.deepEqual(inventory.alerts[0].lockedVersions, ['4.6.7']);
  assert.equal(inventory.mainSha, 'main');
  assert.doesNotMatch(JSON.stringify(inventory), /closed|fixed/);
});

test('an accepted-risk register entry is reported as reviewed, never as patched', () => {
  const result = inspectOpenAlerts(
    [
      {
        number: 71,
        security_vulnerability: { package: { name: 'braces' } },
        security_advisory: { ghsa_id: 'GHSA-vfj7-8cjw-p6xm' },
      },
    ],
    KNOWN_UNPATCHED_ADVISORIES,
    { lockText: lock },
  );
  assert.deepEqual(result.patchedInCheckout, []);
  assert.equal(result.classified[0].classification, 'reviewed-unpatched');
});

test('a no-fix advisory with no register entry blocks the verdict', () => {
  const alert = {
    number: 504,
    security_vulnerability: { package: { name: 'abandoned' }, first_patched_version: null },
    security_advisory: { ghsa_id: 'GHSA-abandoned' },
  };
  const result = inspectOpenAlerts([alert], {}, { lockText: lock });
  assert.match(result.failures[0], /#504.*no reviewed register entry/);
  assert.equal(result.classified[0].classification, 'unresolved');
});

test('a removed dependency passes only with a reviewed removal and no locked instance', () => {
  const alert = fixedAlert(505, 'gone-package', '2.0.1', '< 2.0.1');
  const removals = { 'gone-package': { removedBy: 'test', evidence: 'fixture' } };

  const removed = inspectOpenAlerts([alert], {}, { lockText: lock, removals });
  assert.deepEqual(removed.failures, []);
  assert.equal(removed.classified[0].classification, 'removed-dependency');

  const unexplained = inspectOpenAlerts([alert], {}, { lockText: lock, removals: {} });
  assert.match(unexplained.failures[0], /no locked package instance was found/);
  assert.equal(unexplained.classified[0].classification, 'unresolved');

  const stillLocked = inspectOpenAlerts(
    [alert],
    {},
    {
      lockText: lockOf([['gone-package@npm:^2.0.0', 'gone-package', '2.0.1']]),
      resolutions: { 'gone-package': '2.0.1' },
      removals,
    },
  );
  assert.ok(
    stillLocked.failures.some((failure) =>
      /registered as removed but 2\.0\.1 is still locked/.test(failure),
    ),
  );
});

test('the shipped removal register is empty until a removal is reviewed', () => {
  assert.deepEqual(REVIEWED_REMOVALS, {});
});

test('a dependency change invalidates evidence: a downgrade below the fix fails again', () => {
  const alert = fixedAlert(506, 'fast-uri', '3.1.9', '< 3.1.9');
  const patched = inspectOpenAlerts(
    [alert],
    {},
    {
      lockText: lockOf([['fast-uri@npm:^3.0.0', 'fast-uri', '3.1.9']]),
      resolutions: { 'fast-uri@npm:^3.0.0': '3.1.9' },
    },
  );
  assert.deepEqual(patched.failures, []);
  const regressed = inspectOpenAlerts(
    [alert],
    {},
    {
      lockText: lockOf([['fast-uri@npm:^3.0.0', 'fast-uri', '3.1.8']]),
      resolutions: { 'fast-uri@npm:^3.0.0': '3.1.8' },
    },
  );
  assert.equal(regressed.classified[0].classification, 'vulnerable-in-checkout');
});

test('malformed alert records fail instead of reading as a clean checkout', () => {
  const result = inspectOpenAlerts(
    [
      { number: 'x' },
      { number: 600, security_vulnerability: {}, security_advisory: {} },
      fixedAlert(601, 'odd', 'not-a-version', '< 1.0.0'),
      fixedAlert(602, 'odd-range', '1.0.0', 'whenever'),
    ],
    {},
    { lockText: lock },
  );
  assert.equal(result.failures.length, 4);
  assert.match(result.failures[0], /without a numeric id/);
  assert.match(result.failures[1], /#600 has no package name or GHSA id/);
  assert.match(result.failures[2], /#601.*unreadable patched version/);
  assert.match(result.failures[3], /#602.*unreadable vulnerable range/);
  assert.ok(result.classified.every((entry) => entry.classification === 'unresolved'));
});

test('a failed or truncated GitHub response fails the audit', async () => {
  const unauthorized = async () => ({
    ok: false,
    status: 401,
    headers: { get: () => null },
    json: async () => ({}),
    text: async () => 'Bad credentials',
  });
  await assert.rejects(
    checkDependabotAlerts({
      repository: 'o/r',
      token: 't',
      fetchImpl: unauthorized,
      lockText: lock,
    }),
    /HTTP 401: Bad credentials/,
  );

  // The second page fails mid-pagination: no partial inventory is reported.
  const truncated = async (url) =>
    url.includes('cursor=next')
      ? { ok: false, status: 502, headers: { get: () => null }, text: async () => 'Bad gateway' }
      : {
          ok: true,
          status: 200,
          headers: { get: () => `<${url}&cursor=next>; rel="next"` },
          json: async () => [],
          text: async () => '',
        };
  await assert.rejects(
    checkDependabotAlerts({ repository: 'o/r', token: 't', fetchImpl: truncated, lockText: lock }),
    /HTTP 502/,
  );

  const notJson = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => {
      throw new SyntaxError('Unexpected token <');
    },
    text: async () => '<html>',
  });
  await assert.rejects(
    checkDependabotAlerts({ repository: 'o/r', token: 't', fetchImpl: notJson, lockText: lock }),
    /not JSON/,
  );
});
