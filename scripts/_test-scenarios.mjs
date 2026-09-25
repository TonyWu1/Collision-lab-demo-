/**
 * Verifies process.exitCode is nonzero when overall verdict is FAIL.
 * Simulates: Step 4 produces an unrelated test failure (not the collision).
 */

// --- paste confirmsCollision for verification ---
const COLLISION_TEST_NAME =
  'a successful email login loads the cached profile for the signed-in user';
const COLLISION_ACTUAL_RE   = /^null$/;
const COLLISION_EXPECTED_RE = /u1/;

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

// Simulate the overall verdict logic from run-demo.mjs
function simulateOverall(stepVerdicts) {
  const ok = stepVerdicts.every((v) => v === 'PASS');
  return ok ? 0 : 1;
}

let allPassed = true;
function assert(label, actual, expected) {
  if (actual !== expected) {
    console.error(`FAIL  ${label}\n      expected ${expected}, got ${actual}`);
    allPassed = false;
  } else {
    console.log(`PASS  ${label}`);
  }
}

// --- Scenario A: unrelated test error in Step 4 → overall FAIL, exit 1 ---
{
  const tap = [
    'TAP version 13',
    'not ok 1 - some completely different test broke',
    '  ---',
    '  actual: undefined',
    '  expected: 5',
    '  ...',
    'ok 2 - other test',
    '1..2',
  ].join('\n');
  const parsed = parseTap(tap);
  const collision = confirmsCollision(parsed);
  assert('ScenA: unrelated failure → confirmsCollision=false', collision, false);
  // Step 4 verdict would be FAIL because collision not confirmed
  const step4verdict = collision ? 'PASS' : 'FAIL';
  const exitCode = simulateOverall(['PASS','PASS','PASS', step4verdict, 'PASS']);
  assert('ScenA: overall exit code = 1', exitCode, 1);
}

// --- Scenario B: malformed TAP output → overall FAIL, exit 1 ---
{
  const parsed = parseTap('');  // empty
  assert('ScenB: empty TAP → null', parsed, null);
  const step1verdict = (parsed === null) ? 'FAIL' : 'PASS';
  assert('ScenB: step1 verdict = FAIL', step1verdict, 'FAIL');
  const exitCode = simulateOverall([step1verdict, 'PASS','PASS','PASS','PASS']);
  assert('ScenB: overall exit code = 1', exitCode, 1);
}

// --- Scenario C: all PASS → exit 0 ---
{
  const exitCode = simulateOverall(['PASS','PASS','PASS','PASS','PASS']);
  assert('ScenC: all PASS → exit 0', exitCode, 0);
}

if (!allPassed) { console.error('\nSome scenario tests failed.'); process.exit(1); }
else { console.log('\nAll scenario tests passed.'); process.exit(0); }
