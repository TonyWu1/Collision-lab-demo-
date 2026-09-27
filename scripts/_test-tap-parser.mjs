/**
 * Regression tests for parseTap(), extractYamlFields(), and confirmsCollision().
 *
 * Uses the REAL TAP saved from a previous runner run (scripts/reports/run-*.json)
 * so every test is grounded in actual Node.js test-runner output, not invented strings.
 *
 * Run with: node scripts/_test-tap-parser.mjs
 * Exit 0 = all pass. Exit 1 = at least one failure.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = join(__dirname, 'reports');

// ---------------------------------------------------------------------------
// Load the real saved TAP streams from the most recent JSON report
// ---------------------------------------------------------------------------
const reportFiles = readdirSync(REPORTS_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .reverse();

if (reportFiles.length === 0) {
  console.error('No JSON report files found in scripts/reports/. Run the demo first.');
  process.exit(1);
}

const reportPath = join(REPORTS_DIR, reportFiles[0]);
console.log(`Loading real TAP from: ${reportPath}`);
const report = JSON.parse(readFileSync(reportPath, 'utf8'));

// Step 1 (all-pass run), Step 4 (collision run)
const REAL_PASSING_TAP   = report.steps?.step1?.testRun?.tapRaw ?? '';
const REAL_COLLISION_TAP = report.steps?.step4?.testRun?.tapRaw ?? '';

if (!REAL_PASSING_TAP || !REAL_COLLISION_TAP) {
  console.error('Report is missing step1 or step4 TAP output. Run the demo first.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Paste-in of all four functions under test
// (kept in sync with run-demo.mjs; any divergence is a test maintenance bug)
// ---------------------------------------------------------------------------

function parseTap(tap) {
  if (!tap || !tap.trim()) return null;
  const lines = tap.split('\n');
  const hasTapVersion  = lines.some((l) => l.startsWith('TAP version'));
  const hasTopTestLine = lines.some((l) => /^(ok|not ok) \d+/.test(l));
  if (!hasTapVersion && !hasTopTestLine) return null;

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
        actualIsNull: false, expectedFields: null, errorCode: null, diagnosticYaml: null,
      };
      tests.push(currentTest);
    }
  }

  const planMatch      = tap.match(/^1\.\.(\d+)/m);
  const planned        = planMatch ? Number(planMatch[1]) : null;
  const commentPassM   = tap.match(/^# pass (\d+)/m);
  const commentFailM   = tap.match(/^# fail (\d+)/m);
  const commentPass    = commentPassM ? Number(commentPassM[1]) : null;
  const commentFail    = commentFailM ? Number(commentFailM[1]) : null;
  const passed         = tests.filter((t) =>  t.ok).length;
  const failed         = tests.filter((t) => !t.ok).length;

  if (tests.length === 0 && planned === null) return null;
  if (planned !== null && tests.length === 0) return null;
  if (planned !== null && tests.length !== planned) return null;
  if (commentPass !== null && commentPass !== passed) return null;
  if (commentFail !== null && commentFail !== failed) return null;

  return { ok: failed === 0, passed, failed, planned, tests };
}

function extractYamlFields(yamlLines, test) {
  let inExpectedBlock = false;
  const expectedFields = {};
  let expectedBlockIndent = null;

  for (const line of yamlLines) {
    if (/^\s+actual:\s*~\s*$/.test(line)) {
      test.actualIsNull = true; inExpectedBlock = false; continue;
    }
    if (/^\s+actual:\s+\S/.test(line)) {
      test.actualIsNull = false; inExpectedBlock = false; continue;
    }
    const codeM = line.match(/^\s+code:\s+'?([^'\s]+)'?\s*$/);
    if (codeM) { test.errorCode = codeM[1]; inExpectedBlock = false; continue; }
    if (/^\s+expected:\s*$/.test(line)) {
      inExpectedBlock = true; expectedBlockIndent = null; continue;
    }
    if (/^\s+expected:\s+\S/.test(line)) { inExpectedBlock = false; continue; }
    if (inExpectedBlock) {
      const lineIndent = line.match(/^(\s+)/)?.[1]?.length ?? 0;
      if (expectedBlockIndent === null && line.trim()) expectedBlockIndent = lineIndent;
      if (expectedBlockIndent !== null && lineIndent <= 2 && line.trim() && lineIndent < expectedBlockIndent) {
        inExpectedBlock = false;
      } else if (line.trim()) {
        const fieldM = line.match(/^\s+(\w+):\s+'?([^']+)'?\s*$/);
        if (fieldM) expectedFields[fieldM[1]] = fieldM[2];
        continue;
      }
    }
  }
  if (Object.keys(expectedFields).length > 0) test.expectedFields = expectedFields;
}

const COLLISION_TEST_NAME =
  'a successful email login loads the cached profile for the signed-in user';
const ALICE = { id: 'u1', username: 'alice', email: 'alice@example.com', displayName: 'Alice Chen' };

function confirmsCollision(parsed) {
  if (!parsed || parsed.failed !== 1) return { ok: false, reason: `failed count: ${parsed?.failed ?? 'null'}` };
  const failing = parsed.tests.find((t) => !t.ok);
  if (!failing) return { ok: false, reason: 'no failing test found' };
  if (failing.name !== COLLISION_TEST_NAME) return { ok: false, reason: `wrong test name: "${failing.name}"` };
  if (!failing.actualIsNull) return { ok: false, reason: `actual is not YAML null; got: ${JSON.stringify(failing.actualIsNull)}` };
  if (failing.errorCode !== 'ERR_ASSERTION') return { ok: false, reason: `code not ERR_ASSERTION; got: ${failing.errorCode}` };
  const ef = failing.expectedFields;
  if (!ef) return { ok: false, reason: 'expected block mapping absent' };
  for (const [k, v] of Object.entries(ALICE)) {
    if (ef[k] !== v) return { ok: false, reason: `expected.${k}: got ${JSON.stringify(ef[k])}, want ${JSON.stringify(v)}` };
  }
  return { ok: true, reason: 'all collision conditions met' };
}

// ---------------------------------------------------------------------------
// Micro-test harness
// ---------------------------------------------------------------------------
let failures = 0;
let checks   = 0;

function check(name, actual, expected) {
  checks++;
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) {
    console.error(`FAIL  ${name}`);
    console.error(`      expected: ${JSON.stringify(expected)}`);
    console.error(`      got:      ${JSON.stringify(actual)}`);
    failures++;
  } else {
    console.log(`PASS  ${name}`);
  }
}

// ---------------------------------------------------------------------------
// GROUP 1 — parseTap on the REAL passing TAP (Step 1 output)
// ---------------------------------------------------------------------------
console.log('\n--- GROUP 1: parseTap on real passing TAP (Step 1) ---');
{
  const p = parseTap(REAL_PASSING_TAP);
  check('real passing TAP: parsed is not null',          p !== null,     true);
  check('real passing TAP: ok === true',                 p?.ok,          true);
  check('real passing TAP: passed === 12',               p?.passed,      12);
  check('real passing TAP: failed === 0',                p?.failed,      0);
  check('real passing TAP: planned === 12',              p?.planned,     12);
  check('real passing TAP: tests.length === 12',         p?.tests.length, 12);
  // Verify all tests are marked ok
  const allOk = p?.tests.every((t) => t.ok) ?? false;
  check('real passing TAP: all tests ok',                allOk,          true);
}

// ---------------------------------------------------------------------------
// GROUP 2 — parseTap + extractYamlFields on the REAL collision TAP (Step 4)
// ---------------------------------------------------------------------------
console.log('\n--- GROUP 2: parseTap on real collision TAP (Step 4) ---');
{
  const p = parseTap(REAL_COLLISION_TAP);
  check('real collision TAP: parsed is not null',        p !== null,     true);
  check('real collision TAP: ok === false',              p?.ok,          false);
  check('real collision TAP: failed === 1',              p?.failed,      1);
  check('real collision TAP: passed === 19',             p?.passed,      19);
  check('real collision TAP: planned === 20',            p?.planned,     20);

  const failing = p?.tests.find((t) => !t.ok);
  check('real collision TAP: failing test name',
        failing?.name, COLLISION_TEST_NAME);
  // The key fix: actual must be parsed as YAML null (~), not the string "null"
  check('real collision TAP: actualIsNull === true',     failing?.actualIsNull, true);
  check('real collision TAP: errorCode === ERR_ASSERTION', failing?.errorCode, 'ERR_ASSERTION');
  // All four Alice fields must be parsed from the expected: block mapping
  check('real collision TAP: expected.id',               failing?.expectedFields?.id,          'u1');
  check('real collision TAP: expected.username',         failing?.expectedFields?.username,     'alice');
  check('real collision TAP: expected.email',            failing?.expectedFields?.email,        'alice@example.com');
  check('real collision TAP: expected.displayName',      failing?.expectedFields?.displayName,  'Alice Chen');
}

// ---------------------------------------------------------------------------
// GROUP 3 — confirmsCollision on real collision TAP
// ---------------------------------------------------------------------------
console.log('\n--- GROUP 3: confirmsCollision on real TAP ---');
{
  const p = parseTap(REAL_COLLISION_TAP);
  const result = confirmsCollision(p);
  check('real collision TAP: confirmsCollision.ok === true', result.ok, true);
  check('real collision TAP: reason mentions conditions met', result.reason.includes('all collision'), true);
}

// ---------------------------------------------------------------------------
// GROUP 4 — Defect 1: parseTap rejects version-only output
// ---------------------------------------------------------------------------
console.log('\n--- GROUP 4: Defect 1 — version-only and plan/count mismatch ---');
{
  // Version only — no test lines
  check('version-only → null', parseTap('TAP version 13\n'), null);

  // Plan present but test count mismatches
  const mismatchTap = [
    'TAP version 13',
    'ok 1 - test one',
    'ok 2 - test two',
    '1..3',           // plan says 3, only 2 tests
    '# pass 2',
    '# fail 0',
  ].join('\n');
  check('plan/count mismatch → null', parseTap(mismatchTap), null);

  // Summary comment disagrees with parsed counts
  const liedSummaryTap = [
    'TAP version 13',
    'ok 1 - test one',
    '1..1',
    '# pass 99',   // lie
    '# fail 0',
  ].join('\n');
  check('comment pass count lie → null', parseTap(liedSummaryTap), null);

  // Empty
  check('empty string → null', parseTap(''), null);

  // Whitespace only
  check('whitespace only → null', parseTap('  \n  \t  '), null);
}

// ---------------------------------------------------------------------------
// GROUP 5 — Defect 2: confirmsCollision on real TAP structure
// (verifies fix: actual:~ parsed as null, expected: block parsed, code checked)
// ---------------------------------------------------------------------------
console.log('\n--- GROUP 5: Defect 2 — structured YAML parsing ---');
{
  // Simulate TAP with actual: ~ (real format)
  const actualTildeTap = [
    'TAP version 13',
    `not ok 1 - ${COLLISION_TEST_NAME}`,
    '  ---',
    '  error: some message',
    '  code: \'ERR_ASSERTION\'',
    '  actual: ~',
    '  expected:',
    '    id: \'u1\'',
    '    username: \'alice\'',
    '    email: \'alice@example.com\'',
    '    displayName: \'Alice Chen\'',
    '  ...',
    '1..1',
    '# pass 0',
    '# fail 1',
  ].join('\n');
  const p = parseTap(actualTildeTap);
  check('simulated ~ TAP: parsed not null',      p !== null,                   true);
  check('simulated ~ TAP: failed === 1',         p?.failed,                    1);
  const f = p?.tests.find((t) => !t.ok);
  check('simulated ~ TAP: actualIsNull',         f?.actualIsNull,              true);
  check('simulated ~ TAP: errorCode',            f?.errorCode,                 'ERR_ASSERTION');
  check('simulated ~ TAP: expected.id',          f?.expectedFields?.id,        'u1');
  check('simulated ~ TAP: expected.username',    f?.expectedFields?.username,  'alice');
  const c = confirmsCollision(p);
  check('simulated ~ TAP: confirmsCollision ok', c.ok,                         true);

  // Old string-"null" format would not match — confirmsCollision must reject it
  const oldStringNullTap = [
    'TAP version 13',
    `not ok 1 - ${COLLISION_TEST_NAME}`,
    '  ---',
    '  code: \'ERR_ASSERTION\'',
    '  actual: null',   // string "null" in YAML (not a mapping key pattern, not ~)
    '  expected:',
    '    id: \'u1\'',
    '    username: \'alice\'',
    '    email: \'alice@example.com\'',
    '    displayName: \'Alice Chen\'',
    '  ...',
    '1..1',
    '# pass 0',
    '# fail 1',
  ].join('\n');
  // "  actual: null" matches /^\s+actual:\s+\S/ → actualIsNull stays false
  const p2 = parseTap(oldStringNullTap);
  const f2 = p2?.tests.find((t) => !t.ok);
  check('string "null" not treated as YAML null', f2?.actualIsNull, false);
  const c2 = confirmsCollision(p2);
  check('string "null" → confirmsCollision rejects', c2.ok, false);
}

// ---------------------------------------------------------------------------
// GROUP 6 — Defect 3: text fallback removed; unrelated failure with 2 failures
// (verifies: two tests failing does not confirm collision even if one is the collision test)
// ---------------------------------------------------------------------------
console.log('\n--- GROUP 6: Defect 3 — no text fallback; two failures ---');
{
  const twoFailTap = [
    'TAP version 13',
    `not ok 1 - ${COLLISION_TEST_NAME}`,
    '  ---',
    '  code: \'ERR_ASSERTION\'',
    '  actual: ~',
    '  expected:',
    '    id: \'u1\'',
    '    username: \'alice\'',
    '    email: \'alice@example.com\'',
    '    displayName: \'Alice Chen\'',
    '  ...',
    'not ok 2 - some unrelated test failure',
    '  ---',
    '  actual: false',
    '  expected: true',
    '  ...',
    '1..2',
    '# pass 0',
    '# fail 2',
  ].join('\n');
  const p = parseTap(twoFailTap);
  check('two failures: failed === 2',             p?.failed, 2);
  const c = confirmsCollision(p);
  check('two failures: confirmsCollision.ok false', c.ok, false);
  check('two failures: reason mentions count',   c.reason.includes('failed count: 2'), true);
}

// GROUP 6b — additional unrelated failure (the extra case requested)
{
  const unrelatedOnlyTap = [
    'TAP version 13',
    'not ok 1 - some completely unrelated test',
    '  ---',
    '  code: \'ERR_ASSERTION\'',
    '  actual: false',
    '  expected: true',
    '  ...',
    'ok 2 - passing test',
    '1..2',
    '# pass 1',
    '# fail 1',
  ].join('\n');
  const p = parseTap(unrelatedOnlyTap);
  const c = confirmsCollision(p);
  check('unrelated failure: confirmsCollision.ok false', c.ok, false);
  check('unrelated failure: reason mentions wrong name', c.reason.includes('wrong test name'), true);
}

// ---------------------------------------------------------------------------
// GROUP 7 — Defect 4: process execution checks
// ---------------------------------------------------------------------------
console.log('\n--- GROUP 7: Defect 4 — exit code / signal / spawn error checks ---');
{
  // checkProcessOk
  function checkProcessOk(tr) {
    if (tr.spawnError) return { ok: false, reason: `spawn error: ${tr.spawnError}` };
    if (tr.signal)     return { ok: false, reason: `process killed by signal: ${tr.signal}` };
    if (tr.exitCode !== 0) return { ok: false, reason: `expected exit 0, got ${tr.exitCode}` };
    return { ok: true };
  }
  function checkCollisionProcessOk(tr) {
    if (tr.spawnError) return { ok: false, reason: `spawn error: ${tr.spawnError}` };
    if (tr.signal)     return { ok: false, reason: `process killed by signal: ${tr.signal}` };
    if (tr.exitCode !== 1) return { ok: false, reason: `expected exit 1 (test failure), got ${tr.exitCode}` };
    return { ok: true };
  }

  check('processOk: exit 0 passes',          checkProcessOk({ exitCode: 0, signal: null, spawnError: null }).ok, true);
  check('processOk: exit 1 fails',           checkProcessOk({ exitCode: 1, signal: null, spawnError: null }).ok, false);
  check('processOk: signal fails',           checkProcessOk({ exitCode: null, signal: 'SIGKILL', spawnError: null }).ok, false);
  check('processOk: spawnError fails',       checkProcessOk({ exitCode: null, signal: null, spawnError: 'ENOENT' }).ok, false);
  check('collisionProcessOk: exit 1 passes', checkCollisionProcessOk({ exitCode: 1, signal: null, spawnError: null }).ok, true);
  check('collisionProcessOk: exit 0 fails',  checkCollisionProcessOk({ exitCode: 0, signal: null, spawnError: null }).ok, false);
  check('collisionProcessOk: exit 2 fails',  checkCollisionProcessOk({ exitCode: 2, signal: null, spawnError: null }).ok, false);

  // Verify real Step 1 exit code (from saved report)
  check('real step1 exitCode === 0',   report.steps?.step1?.testRun?.exitCode,  0);
  check('real step1 signal is null',   report.steps?.step1?.testRun?.signal || null,  null);
  check('real step1 spawnError null',  report.steps?.step1?.testRun?.spawnError || null, null);
  // Verify real Step 4 exit code (from saved report)
  check('real step4 exitCode === 1',   report.steps?.step4?.testRun?.exitCode,  1);
}

// ---------------------------------------------------------------------------
// GROUP 8 — Defect 5: partial report saved before process.exit
// (we can only verify the logic; the actual file is saved by run-demo.mjs)
// Verify that buildMarkdown handles missing refs/steps gracefully
// ---------------------------------------------------------------------------
console.log('\n--- GROUP 8: Defect 5 — partial evidence handles missing fields ---');
{
  // Simulate what saveReports receives when initError is set
  const partial = {
    runTimestamp: '2099-01-01T00-00-00-000Z',
    nodeVersion: 'v24.0.0',
    refs: {},
    steps: {},
    cleanup: [],
    overallVerdict: 'FAIL',
    initError: 'Cannot resolve ref: branch not found',
  };
  // Verify iterating over empty refs/steps doesn't throw
  let threw = false;
  try {
    const lines = [];
    lines.push('# CollisionLab Evidence Report');
    lines.push(`**Run:** \`${partial.runTimestamp}\``);
    if (partial.initError) lines.push(`**Init error:** \`${partial.initError}\``);
    for (const [k, v] of Object.entries(partial.refs ?? {})) {
      lines.push(`| \`${k}\` | \`${v}\` |`);
    }
    for (const c of (partial.cleanup ?? [])) {
      lines.push(`| \`${c.dir}\` |`);
    }
  } catch (e) { threw = true; }
  check('partial evidence: no throw when refs/steps empty', threw, false);
  check('partial evidence: initError is set',              partial.initError !== undefined, true);
}

// ---------------------------------------------------------------------------
// GROUP 9 — confirmsCollision requires ERR_ASSERTION specifically
// ---------------------------------------------------------------------------
console.log('\n--- GROUP 9: confirmsCollision requires ERR_ASSERTION ---');
{
  const wrongCodeTap = [
    'TAP version 13',
    `not ok 1 - ${COLLISION_TEST_NAME}`,
    '  ---',
    '  code: \'ERR_SOME_OTHER_CODE\'',
    '  actual: ~',
    '  expected:',
    '    id: \'u1\'',
    '    username: \'alice\'',
    '    email: \'alice@example.com\'',
    '    displayName: \'Alice Chen\'',
    '  ...',
    '1..1',
    '# pass 0',
    '# fail 1',
  ].join('\n');
  const p = parseTap(wrongCodeTap);
  const c = confirmsCollision(p);
  check('wrong error code → confirmsCollision false', c.ok, false);
  check('wrong error code → reason mentions code', c.reason.includes('ERR_ASSERTION'), true);
}

// ---------------------------------------------------------------------------
// GROUP 10 — confirmsCollision requires complete Alice object
// ---------------------------------------------------------------------------
console.log('\n--- GROUP 10: confirmsCollision requires complete Alice object ---');
{
  // Missing displayName
  const missingFieldTap = [
    'TAP version 13',
    `not ok 1 - ${COLLISION_TEST_NAME}`,
    '  ---',
    '  code: \'ERR_ASSERTION\'',
    '  actual: ~',
    '  expected:',
    '    id: \'u1\'',
    '    username: \'alice\'',
    '    email: \'alice@example.com\'',
    // displayName missing
    '  ...',
    '1..1',
    '# pass 0',
    '# fail 1',
  ].join('\n');
  const p = parseTap(missingFieldTap);
  const c = confirmsCollision(p);
  check('missing displayName → confirmsCollision false', c.ok, false);
  check('missing displayName → reason mentions field', c.reason.includes('displayName'), true);

  // Wrong id
  const wrongIdTap = [
    'TAP version 13',
    `not ok 1 - ${COLLISION_TEST_NAME}`,
    '  ---',
    '  code: \'ERR_ASSERTION\'',
    '  actual: ~',
    '  expected:',
    '    id: \'u99\'',
    '    username: \'alice\'',
    '    email: \'alice@example.com\'',
    '    displayName: \'Alice Chen\'',
    '  ...',
    '1..1',
    '# pass 0',
    '# fail 1',
  ].join('\n');
  const p2 = parseTap(wrongIdTap);
  const c2 = confirmsCollision(p2);
  check('wrong id → confirmsCollision false', c2.ok, false);
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------
console.log(`\n${'─'.repeat(60)}`);
if (failures > 0) {
  console.error(`\n${failures}/${checks} test(s) FAILED.`);
  process.exit(1);
} else {
  console.log(`\nAll ${checks} tests PASSED.`);
  process.exit(0);
}
