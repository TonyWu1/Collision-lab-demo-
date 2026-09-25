/**
 * Inline unit tests for parseTap() and confirmsCollision() logic.
 * Run with: node scripts/_test-tap-parser.mjs
 * Exit 0 = all pass. Exit 1 = at least one failure.
 */

const COLLISION_TEST_NAME =
  'a successful email login loads the cached profile for the signed-in user';
const COLLISION_ACTUAL_RE   = /^null$/;
const COLLISION_EXPECTED_RE = /u1/;
const COLLISION_ASSERTION_MSG =
  'Successful login should load the profile, but the email is not the username cache key';

// ---------------------------------------------------------------------------
// Paste-in of the production functions for isolated testing
// ---------------------------------------------------------------------------

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
        for (const yl of yamlLines) {
          const am = yl.match(/^\s+actual:\s+(.+)$/);
          const em = yl.match(/^\s+expected:\s+(.+)$/);
          if (am) currentTest.actual   = am[1].trim();
          if (em) currentTest.expected = em[1].trim();
        }
      }
      yamlLines = []; continue;
    }
    if (inYaml) { yamlLines.push(raw); continue; }
    const m = raw.match(/^(ok|not ok) (\d+) - (.*)$/);
    if (m) {
      currentTest = {
        number: Number(m[2]), ok: m[1] === 'ok', name: m[3].trim(),
        actual: null, expected: null, diagnosticYaml: null,
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

function confirmsCollision(parsed) {
  if (!parsed || parsed.failed !== 1) return false;
  const failing = parsed.tests.find((t) => !t.ok);
  if (!failing) return false;
  if (failing.name !== COLLISION_TEST_NAME) return false;
  if (!COLLISION_ACTUAL_RE.test(failing.actual ?? '')) return false;
  const yaml = failing.diagnosticYaml ?? '';
  if (!COLLISION_EXPECTED_RE.test(failing.expected ?? '') && !yaml.includes('u1')) return false;
  return true;
}

function confirmsCollisionFromOutput(testResult) {
  if (confirmsCollision(testResult.parsed)) return true;
  const combined = (testResult.stdout ?? '') + (testResult.stderr ?? '');
  return (
    combined.includes(COLLISION_ASSERTION_MSG) &&
    combined.includes('actual: null') &&
    combined.includes('u1')
  );
}

// ---------------------------------------------------------------------------
// Micro-test harness
// ---------------------------------------------------------------------------
let failures = 0;

function check(name, actual, expected) {
  if (actual !== expected) {
    console.error(`FAIL  ${name}\n      expected: ${expected}\n      got:      ${actual}`);
    failures++;
  } else {
    console.log(`PASS  ${name}`);
  }
}

// ---------------------------------------------------------------------------
// NEGATIVE CASE 1 — empty TAP output → null (fail-closed)
// ---------------------------------------------------------------------------
check('NC1 empty string → null',                     parseTap(''),          null);
check('NC1 whitespace-only → null',                  parseTap('   \n  '),   null);

// ---------------------------------------------------------------------------
// NEGATIVE CASE 2 — plan present but no test lines → null (fail-closed)
// ---------------------------------------------------------------------------
{
  const tap = 'TAP version 13\n1..3\n';
  check('NC2 plan with no test lines → null', parseTap(tap), null);
}

// ---------------------------------------------------------------------------
// NEGATIVE CASE 3 — unrelated test name fails; must not confirm collision
// ---------------------------------------------------------------------------
{
  const tap = [
    'TAP version 13',
    'not ok 1 - some unrelated test failure',
    '  ---',
    '  actual: undefined',
    '  expected: 42',
    '  ...',
    'ok 2 - another test',
    '1..2',
  ].join('\n');
  const p = parseTap(tap);
  check('NC3 unrelated failure → failed=1',        p?.failed, 1);
  check('NC3 unrelated failure → confirmsCollision=false',
        confirmsCollisionFromOutput({ parsed: p, stdout: '', stderr: '' }), false);
}

// ---------------------------------------------------------------------------
// NEGATIVE CASE 4 — correct test name but actual is NOT null
// ---------------------------------------------------------------------------
{
  const tap = [
    'TAP version 13',
    `not ok 1 - ${COLLISION_TEST_NAME}`,
    '  ---',
    "  actual: { id: 'u1' }",
    '  expected: null',
    '  ...',
    '1..1',
  ].join('\n');
  const p = parseTap(tap);
  check('NC4 correct name but actual != null → false', confirmsCollision(p), false);
}

// ---------------------------------------------------------------------------
// NEGATIVE CASE 5 — multiple failures; collision requires exactly 1
// ---------------------------------------------------------------------------
{
  const tap = [
    'TAP version 13',
    `not ok 1 - ${COLLISION_TEST_NAME}`,
    '  ---',
    '  actual: null',
    "  expected: { id: 'u1' }",
    '  ...',
    'not ok 2 - some other test',
    '  ---',
    '  actual: false',
    '  expected: true',
    '  ...',
    '1..2',
  ].join('\n');
  const p = parseTap(tap);
  check('NC5 two failures → parsed.failed=2',            p?.failed, 2);
  check('NC5 two failures → confirmsCollision=false',    confirmsCollision(p), false);
}

// ---------------------------------------------------------------------------
// NEGATIVE CASE 6 — stderr contains assertion msg but different test name
// (fallback path must also check name implicitly via the exact message)
// ---------------------------------------------------------------------------
{
  const fakeOutput = {
    parsed: null,
    stdout: '',
    stderr: `${COLLISION_ASSERTION_MSG}\nactual: null\nu1 data something`,
  };
  // Fallback path does not check test name, only message + actual + u1.
  // This is intentional: if TAP is missing we can't check the name,
  // so the fallback accepts the string match. Verify it fires.
  check('NC6 fallback fires on exact message+null+u1',
        confirmsCollisionFromOutput(fakeOutput), true);
}

// ---------------------------------------------------------------------------
// NEGATIVE CASE 7 — fallback: message present but actual is not null
// ---------------------------------------------------------------------------
{
  const fakeOutput = {
    parsed: null,
    stdout: '',
    stderr: `${COLLISION_ASSERTION_MSG}\nactual: { id: 'u1' }\nu1`,
  };
  check('NC7 fallback: message but actual != null → false',
        confirmsCollisionFromOutput(fakeOutput), false);
}

// ---------------------------------------------------------------------------
// POSITIVE CASE 1 — exact collision fingerprint
// ---------------------------------------------------------------------------
{
  const tap = [
    'TAP version 13',
    'ok 1 - logs in with a valid email',
    `not ok 2 - ${COLLISION_TEST_NAME}`,
    '  ---',
    '  actual: null',
    "  expected: { id: 'u1', username: 'alice' }",
    '  ...',
    'ok 3 - another passing test',
    '1..3',
  ].join('\n');
  const p = parseTap(tap);
  check('PC1 exact collision → parsed.failed=1',  p?.failed, 1);
  check('PC1 exact collision → confirmsCollision=true', confirmsCollision(p), true);
}

// ---------------------------------------------------------------------------
// POSITIVE CASE 2 — correct name + actual null + u1 in YAML (not expected line)
// ---------------------------------------------------------------------------
{
  const tap = [
    'TAP version 13',
    `not ok 1 - ${COLLISION_TEST_NAME}`,
    '  ---',
    '  actual: null',
    '  diff: |',
    "    - { id: 'u1', username: 'alice' }",
    '  ...',
    '1..1',
  ].join('\n');
  const p = parseTap(tap);
  check('PC2 u1 in YAML block → confirmsCollision=true', confirmsCollision(p), true);
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------
if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
} else {
  console.log(`\nAll ${13 - failures} tests passed.`);
  process.exit(0);
}
