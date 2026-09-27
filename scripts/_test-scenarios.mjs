/**
 * Unit tests for collision fingerprint functions and overall verdict logic.
 *
 * Covers:
 *   - S1 confirmsCollision (email-login identity mismatch)
 *   - S2 confirmsCollisionS2 (NaN cart total) — negative checks on wrong actual/expected
 *   - S3 confirmsCollisionS3 (soft-delete/reporting) — negative checks on wrong counts,
 *     wrong names, wrong actual/expected values, unexpected extra failures
 *   - Overall exit-code verdict simulation
 */

// ---------------------------------------------------------------------------
// Inline TAP parser (mirrors the parser in run-demo.mjs for isolation)
// ---------------------------------------------------------------------------
function extractYamlFields(yamlLines, test) {
  let inExpectedBlock = false;
  let expectedBlockIndent = null;
  const expectedFields = {};
  for (const line of yamlLines) {
    if (/^\s+actual:\s*~\s*$/.test(line)) {
      test.actualIsNull = true; inExpectedBlock = false; continue;
    }
    if (/^\s+actual:\s+\S/.test(line)) {
      const vm = line.match(/^\s+actual:\s+(.+)\s*$/);
      if (vm) test.actualValue = vm[1].trim();
      test.actualIsNull = false; inExpectedBlock = false; continue;
    }
    const codeM = line.match(/^\s+code:\s+'?([^'\s]+)'?\s*$/);
    if (codeM) { test.errorCode = codeM[1]; inExpectedBlock = false; continue; }
    if (/^\s+expected:\s*$/.test(line)) { inExpectedBlock = true; expectedBlockIndent = null; continue; }
    if (/^\s+expected:\s+\S/.test(line)) {
      const vm = line.match(/^\s+expected:\s+(.+)\s*$/);
      if (vm) test.expectedValue = vm[1].trim();
      inExpectedBlock = false; continue;
    }
    if (inExpectedBlock) {
      const lineIndent = line.match(/^(\s+)/)?.[1]?.length ?? 0;
      if (expectedBlockIndent === null && line.trim()) expectedBlockIndent = lineIndent;
      if (expectedBlockIndent !== null && lineIndent <= 2 && line.trim() && lineIndent < expectedBlockIndent) {
        inExpectedBlock = false;
      } else if (line.trim()) {
        const fieldM = line.match(/^\s+(\w+):\s+'?([^']+)'?\s*$/);
        if (fieldM) expectedFields[fieldM[1]] = fieldM[2];
      }
    }
  }
  if (Object.keys(expectedFields).length > 0) test.expectedFields = expectedFields;
}

function parseTap(tap) {
  if (!tap || !tap.trim()) return null;
  const lines = tap.split('\n');
  const hasTapVersion = lines.some((l) => l.startsWith('TAP version'));
  const hasTestLine   = lines.some((l) => /^(ok|not ok) \d+/.test(l));
  if (!hasTapVersion && !hasTestLine) return null;
  const tests = [];
  let inYaml = false, yamlLines = [], currentTest = null;
  for (const raw of lines) {
    if (raw === '  ---') { inYaml = true; yamlLines = []; continue; }
    if (raw === '  ...') {
      inYaml = false;
      if (currentTest) {
        currentTest.diagnosticYaml = yamlLines.join('\n');
        extractYamlFields(yamlLines, currentTest);
      }
      yamlLines = []; continue;
    }
    if (inYaml) { yamlLines.push(raw); continue; }
    const m = raw.match(/^(ok|not ok) (\d+) - (.*)$/);
    if (m) {
      currentTest = {
        number: Number(m[2]), ok: m[1] === 'ok', name: m[3].trim(),
        actualIsNull: false, actualValue: null, expectedValue: null,
        errorCode: null, expectedFields: null, diagnosticYaml: null,
      };
      if (!raw.startsWith(' ')) tests.push(currentTest);
    }
  }
  const planMatch = tap.match(/^1\.\.(\d+)/m);
  const planned = planMatch ? Number(planMatch[1]) : null;
  const passed = tests.filter((t) => t.ok).length;
  const failed = tests.filter((t) => !t.ok).length;
  if (planned !== null && tests.length === 0) return null;
  return { ok: failed === 0, passed, failed, planned, tests };
}

// ---------------------------------------------------------------------------
// S1 fingerprint (email-login identity mismatch — actual=null, expected=Alice)
// ---------------------------------------------------------------------------
const S1_COLLISION_TEST_NAME =
  'a successful email login loads the cached profile for the signed-in user';
const ALICE = { id: 'u1', username: 'alice', email: 'alice@example.com', displayName: 'Alice Chen' };

function confirmsCollisionS1(parsed) {
  if (!parsed || parsed.failed !== 1) return { ok: false, reason: `failed count: ${parsed?.failed ?? 'null'}` };
  const failing = parsed.tests.find((t) => !t.ok);
  if (!failing)                                  return { ok: false, reason: 'no failing test found' };
  if (failing.name !== S1_COLLISION_TEST_NAME)   return { ok: false, reason: `wrong test name: "${failing.name}"` };
  if (!failing.actualIsNull)                     return { ok: false, reason: 'actual is not YAML null (~)' };
  if (failing.errorCode !== 'ERR_ASSERTION')     return { ok: false, reason: `code: ${failing.errorCode}` };
  const ef = failing.expectedFields;
  if (!ef) return { ok: false, reason: 'expected block mapping absent' };
  for (const [k, v] of Object.entries(ALICE)) {
    if (ef[k] !== v) return { ok: false, reason: `expected.${k}: got ${JSON.stringify(ef[k])}, want ${JSON.stringify(v)}` };
  }
  return { ok: true, reason: 'all conditions met: actual=null, expected=Alice, ERR_ASSERTION' };
}

// ---------------------------------------------------------------------------
// S2 fingerprint (NaN cart total — actual=NaN, expected=40)
// ---------------------------------------------------------------------------
const S2_COLLISION_TEST_NAME = 'COLLISION: cart total is NaN when catalog returns price objects';

function confirmsCollisionS2(parsed) {
  if (!parsed || parsed.failed !== 1) return { ok: false, reason: `failed count: ${parsed?.failed ?? 'null'}` };
  const failing = parsed.tests.find((t) => !t.ok);
  if (!failing) return { ok: false, reason: 'no failing test found' };
  if (failing.name !== S2_COLLISION_TEST_NAME) return { ok: false, reason: `wrong test name: "${failing.name}"` };
  if (failing.errorCode !== 'ERR_ASSERTION') return { ok: false, reason: `code: ${failing.errorCode}` };
  if (failing.actualIsNull) return { ok: false, reason: 'actual is null, not NaN' };
  if (failing.actualValue !== 'NaN') return { ok: false, reason: `actual value is not NaN; got: ${JSON.stringify(failing.actualValue)}` };
  if (failing.expectedValue !== '40') return { ok: false, reason: `expected value is not 40; got: ${JSON.stringify(failing.expectedValue)}` };
  return { ok: true, reason: 'all conditions met: actual=NaN, expected=40, ERR_ASSERTION' };
}

// ---------------------------------------------------------------------------
// S3 fingerprint (soft-delete/reporting collision — exactly 3 failures)
// ---------------------------------------------------------------------------
const S3_COLLISION_TEST_NAME = 'COLLISION: active user count is wrong after a removal';
const S3_EARLY_DETECTION_TEST_NAMES = [
  'getActiveUserCount decrements after a user is removed',
  'getUserSummary excludes removed users',
];

function confirmsCollisionS3(parsed) {
  if (!parsed || parsed.failed === 0) return { ok: false, reason: 'no test failures found' };
  if (parsed.failed !== 3) return { ok: false, reason: `expected exactly 3 failures (2 early-detection + 1 collision); got ${parsed.failed}` };
  const failingTests = parsed.tests.filter((t) => !t.ok);
  const failingNames = failingTests.map((t) => t.name);
  for (const name of S3_EARLY_DETECTION_TEST_NAMES) {
    if (!failingNames.includes(name)) return { ok: false, reason: `early-detection test missing: "${name}"` };
  }
  if (!failingNames.includes(S3_COLLISION_TEST_NAME)) {
    return { ok: false, reason: `named collision test did not fail (failures: ${failingNames.join('; ')})` };
  }
  for (const t of failingTests) {
    if (t.errorCode !== 'ERR_ASSERTION') return { ok: false, reason: `"${t.name}": code=${t.errorCode}, expected ERR_ASSERTION` };
    if (t.actualValue !== '3')   return { ok: false, reason: `"${t.name}": actual=${JSON.stringify(t.actualValue)}, expected '3'` };
    if (t.expectedValue !== '2') return { ok: false, reason: `"${t.name}": expected=${JSON.stringify(t.expectedValue)}, expected '2'` };
  }
  return { ok: true, reason: 'all conditions met: exactly 3 failures (2 early-detection + 1 collision), actual=3, expected=2, ERR_ASSERTION' };
}

// ---------------------------------------------------------------------------
// Overall verdict simulation
// ---------------------------------------------------------------------------
function simulateOverall(stepVerdicts) {
  return stepVerdicts.every((v) => v === 'PASS') ? 0 : 1;
}

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------
let allPassed = true;
function assert(label, actual, expected) {
  if (actual !== expected) {
    console.error(`FAIL  ${label}\n      expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    allPassed = false;
  } else {
    console.log(`PASS  ${label}`);
  }
}
function assertOk(label, result)   { assert(label, result.ok, true); }
function assertFail(label, result) { assert(label, result.ok, false); }

// ---------------------------------------------------------------------------
// TAP builder helpers
// ---------------------------------------------------------------------------
function makeTapTest({ n, ok, name, actual, expected, code, actualIsYamlNull = false }) {
  const lines = [`${ok ? 'ok' : 'not ok'} ${n} - ${name}`];
  if (!ok) {
    lines.push('  ---');
    if (actualIsYamlNull) lines.push('  actual: ~');
    else if (actual !== undefined) lines.push(`  actual: ${actual}`);
    if (expected !== undefined) lines.push(`  expected: ${expected}`);
    if (code) lines.push(`  code: '${code}'`);
    lines.push('  ...');
  }
  return lines.join('\n');
}

function makeTapOutput(tests) {
  const body = tests.map((t) => makeTapTest(t)).join('\n');
  return `TAP version 13\n${body}\n1..${tests.length}`;
}

// ---------------------------------------------------------------------------
// Helpers that build canonical-good TAP for each scenario
// ---------------------------------------------------------------------------
function goodS1Tap() {
  return [
    'TAP version 13',
    `not ok 1 - ${S1_COLLISION_TEST_NAME}`,
    '  ---',
    '  actual: ~',
    '  expected:',
    "    id: 'u1'",
    "    username: 'alice'",
    "    email: 'alice@example.com'",
    "    displayName: 'Alice Chen'",
    "  code: 'ERR_ASSERTION'",
    '  ...',
    '1..1',
  ].join('\n');
}

function goodS2Tap() {
  return makeTapOutput([
    { n: 1, ok: false, name: S2_COLLISION_TEST_NAME, actual: 'NaN', expected: '40', code: 'ERR_ASSERTION' },
  ]);
}

function goodS3Tap() {
  const failures = [
    ...S3_EARLY_DETECTION_TEST_NAMES,
    S3_COLLISION_TEST_NAME,
  ].map((name, i) => ({ n: i + 1, ok: false, name, actual: '3', expected: '2', code: 'ERR_ASSERTION' }));
  return makeTapOutput(failures);
}

// ---------------------------------------------------------------------------
// ═══ S1 tests ═══
// ---------------------------------------------------------------------------
console.log('\n── S1: email-login identity mismatch ──');
{
  // S1-positive: canonical good TAP
  assertOk('S1-pos: canonical good TAP passes', confirmsCollisionS1(parseTap(goodS1Tap())));

  // S1-neg: actual is not null (has a value)
  {
    const tap = makeTapOutput([
      { n: 1, ok: false, name: S1_COLLISION_TEST_NAME, actual: '{ id: u2 }', expected: '40', code: 'ERR_ASSERTION' },
    ]);
    assertFail('S1-neg: actual is not null → rejected', confirmsCollisionS1(parseTap(tap)));
  }

  // S1-neg: wrong test name
  {
    const tap = makeTapOutput([
      { n: 1, ok: false, name: 'some other test', actualIsYamlNull: true, code: 'ERR_ASSERTION' },
    ]);
    assertFail('S1-neg: wrong test name → rejected', confirmsCollisionS1(parseTap(tap)));
  }

  // S1-neg: unrelated failure
  {
    const tap = makeTapOutput([
      { n: 1, ok: false, name: 'some completely different test', actual: 'undefined', expected: '5' },
    ]);
    assertFail('S1-neg: unrelated failure → rejected', confirmsCollisionS1(parseTap(tap)));
  }
}

// ---------------------------------------------------------------------------
// ═══ S2 tests ═══
// ---------------------------------------------------------------------------
console.log('\n── S2: NaN cart total ──');
{
  // S2-positive: canonical good TAP
  assertOk('S2-pos: canonical good TAP passes', confirmsCollisionS2(parseTap(goodS2Tap())));

  // S2-neg: actual is a number (not NaN) — e.g. cart computed correctly
  {
    const tap = makeTapOutput([
      { n: 1, ok: false, name: S2_COLLISION_TEST_NAME, actual: '40', expected: '40', code: 'ERR_ASSERTION' },
    ]);
    assertFail('S2-neg: actual=40 (not NaN) → rejected', confirmsCollisionS2(parseTap(tap)));
  }

  // S2-neg: expected is wrong value (not 40)
  {
    const tap = makeTapOutput([
      { n: 1, ok: false, name: S2_COLLISION_TEST_NAME, actual: 'NaN', expected: '80', code: 'ERR_ASSERTION' },
    ]);
    assertFail('S2-neg: expected=80 (not 40) → rejected', confirmsCollisionS2(parseTap(tap)));
  }

  // S2-neg: actual is null
  {
    const tap = makeTapOutput([
      { n: 1, ok: false, name: S2_COLLISION_TEST_NAME, actualIsYamlNull: true, expected: '40', code: 'ERR_ASSERTION' },
    ]);
    assertFail('S2-neg: actual=null (not NaN) → rejected', confirmsCollisionS2(parseTap(tap)));
  }

  // S2-neg: wrong test name
  {
    const tap = makeTapOutput([
      { n: 1, ok: false, name: 'wrong test name', actual: 'NaN', expected: '40', code: 'ERR_ASSERTION' },
    ]);
    assertFail('S2-neg: wrong test name → rejected', confirmsCollisionS2(parseTap(tap)));
  }

  // S2-neg: all tests pass (no collision)
  {
    const tap = makeTapOutput([{ n: 1, ok: true, name: S2_COLLISION_TEST_NAME }]);
    assertFail('S2-neg: no failures → rejected', confirmsCollisionS2(parseTap(tap)));
  }
}

// ---------------------------------------------------------------------------
// ═══ S3 tests ═══
// ---------------------------------------------------------------------------
console.log('\n── S3: soft-delete / reporting collision ──');
{
  // S3-positive: canonical good TAP (exactly 3 failures with correct names/values)
  assertOk('S3-pos: canonical good TAP passes', confirmsCollisionS3(parseTap(goodS3Tap())));

  // S3-neg: only 2 failures (missing the integration collision test)
  {
    const tap = makeTapOutput(
      S3_EARLY_DETECTION_TEST_NAMES.map((name, i) => ({
        n: i + 1, ok: false, name, actual: '3', expected: '2', code: 'ERR_ASSERTION',
      }))
    );
    assertFail('S3-neg: only 2 failures (no integration test) → rejected', confirmsCollisionS3(parseTap(tap)));
  }

  // S3-neg: 4 failures (unexpected extra failure)
  {
    const extraFailure = { n: 4, ok: false, name: 'some unexpected extra test', actual: '0', expected: '1', code: 'ERR_ASSERTION' };
    const failures = [
      ...S3_EARLY_DETECTION_TEST_NAMES.map((name, i) => ({ n: i + 1, ok: false, name, actual: '3', expected: '2', code: 'ERR_ASSERTION' })),
      { n: 3, ok: false, name: S3_COLLISION_TEST_NAME, actual: '3', expected: '2', code: 'ERR_ASSERTION' },
      extraFailure,
    ];
    const tap = `TAP version 13\n${failures.map((t) => makeTapTest(t)).join('\n')}\n1..4`;
    assertFail('S3-neg: 4 failures (unexpected extra) → rejected', confirmsCollisionS3(parseTap(tap)));
  }

  // S3-neg: collision test present but one early-detection test missing
  {
    const tap = makeTapOutput([
      { n: 1, ok: false, name: S3_EARLY_DETECTION_TEST_NAMES[0], actual: '3', expected: '2', code: 'ERR_ASSERTION' },
      { n: 2, ok: false, name: 'wrong early detection test', actual: '3', expected: '2', code: 'ERR_ASSERTION' },
      { n: 3, ok: false, name: S3_COLLISION_TEST_NAME, actual: '3', expected: '2', code: 'ERR_ASSERTION' },
    ]);
    assertFail('S3-neg: wrong early-detection name → rejected', confirmsCollisionS3(parseTap(tap)));
  }

  // S3-neg: wrong actual value (e.g. 5 instead of 3)
  {
    const tap = makeTapOutput([
      ...S3_EARLY_DETECTION_TEST_NAMES.map((name, i) => ({ n: i + 1, ok: false, name, actual: '5', expected: '2', code: 'ERR_ASSERTION' })),
      { n: 3, ok: false, name: S3_COLLISION_TEST_NAME, actual: '5', expected: '2', code: 'ERR_ASSERTION' },
    ]);
    assertFail('S3-neg: actual=5 (not 3) → rejected', confirmsCollisionS3(parseTap(tap)));
  }

  // S3-neg: wrong expected value (e.g. 0 instead of 2)
  {
    const tap = makeTapOutput([
      ...S3_EARLY_DETECTION_TEST_NAMES.map((name, i) => ({ n: i + 1, ok: false, name, actual: '3', expected: '0', code: 'ERR_ASSERTION' })),
      { n: 3, ok: false, name: S3_COLLISION_TEST_NAME, actual: '3', expected: '0', code: 'ERR_ASSERTION' },
    ]);
    assertFail('S3-neg: expected=0 (not 2) → rejected', confirmsCollisionS3(parseTap(tap)));
  }

  // S3-neg: wrong error code on the collision test
  {
    const tap = makeTapOutput([
      ...S3_EARLY_DETECTION_TEST_NAMES.map((name, i) => ({ n: i + 1, ok: false, name, actual: '3', expected: '2', code: 'ERR_ASSERTION' })),
      { n: 3, ok: false, name: S3_COLLISION_TEST_NAME, actual: '3', expected: '2', code: 'ERR_UNHANDLED' },
    ]);
    assertFail('S3-neg: wrong error code → rejected', confirmsCollisionS3(parseTap(tap)));
  }

  // S3-neg: named collision test absent (only the 2 early-detection tests, but 3 total including a different third)
  {
    const tap = makeTapOutput([
      ...S3_EARLY_DETECTION_TEST_NAMES.map((name, i) => ({ n: i + 1, ok: false, name, actual: '3', expected: '2', code: 'ERR_ASSERTION' })),
      { n: 3, ok: false, name: 'completely different third failure', actual: '3', expected: '2', code: 'ERR_ASSERTION' },
    ]);
    assertFail('S3-neg: collision test absent (different third failure) → rejected', confirmsCollisionS3(parseTap(tap)));
  }
}

// ---------------------------------------------------------------------------
// ═══ Overall verdict / exit-code simulation ═══
// ---------------------------------------------------------------------------
console.log('\n── Overall verdict ──');
{
  // ScenA: unrelated failure in step 4 → exit 1
  {
    const tap = makeTapOutput([
      { n: 1, ok: false, name: 'some completely different test broke', actual: 'undefined', expected: '5' },
      { n: 2, ok: true,  name: 'other test' },
    ]);
    const parsed = parseTap(tap);
    const collision = confirmsCollisionS1(parsed);
    assertFail('ScenA: unrelated failure → confirmsCollisionS1=false', collision);
    const exitCode = simulateOverall(['PASS','PASS','PASS', collision.ok ? 'PASS' : 'FAIL', 'PASS']);
    assert('ScenA: overall exit code = 1', exitCode, 1);
  }

  // ScenB: malformed/empty TAP → exit 1
  {
    const parsed = parseTap('');
    assert('ScenB: empty TAP → null', parsed, null);
    const exitCode = simulateOverall([parsed === null ? 'FAIL' : 'PASS', 'PASS','PASS','PASS','PASS']);
    assert('ScenB: overall exit code = 1', exitCode, 1);
  }

  // ScenC: all PASS → exit 0
  {
    const exitCode = simulateOverall(['PASS','PASS','PASS','PASS','PASS']);
    assert('ScenC: all PASS → exit 0', exitCode, 0);
  }
}

if (!allPassed) { console.error('\nSome scenario tests failed.'); process.exit(1); }
else { console.log('\nAll scenario tests passed.'); process.exit(0); }
