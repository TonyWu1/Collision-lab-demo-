#!/usr/bin/env node
/**
 * CollisionLab hardened evidence runner — scripts/run-demo.mjs
 *
 * Runs five demonstration steps, each in a temporary Git worktree.
 * Branch refs are pinned to full commit SHAs at startup.
 * Saves JSON and Markdown reports to scripts/reports/ on every run,
 * including partial reports when initialization fails.
 * Exits with code 0 only when all five steps produce the expected outcome.
 * Exits with code 1 for any unexpected result, including malformed output.
 *
 * Steps
 *  1  feature/email-auth             — independent suite; all tests pass; exit 0
 *  2  feature/profile-cache-v2       — independent suite; all pass; exit 0; control check
 *  3  merge worktree                 — email-auth merged in; no conflicts; unit tests pass; exit 0
 *  4  merge worktree (continued)     — inject original failing integration test;
 *                                      exactly one failure (ERR_ASSERTION, actual null,
 *                                      expected Alice object); exit 1
 *  5  fix/canonical-profile-identity — full suite; all pass; exit 0
 */

import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync, rmSync,
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const __dirname   = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT   = resolve(__dirname, '..');
const REPORTS_DIR = join(__dirname, 'reports');
const NODE        = process.execPath;
mkdirSync(REPORTS_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

function findGit() {
  for (const c of ['git', 'C:\\Program Files\\Git\\bin\\git.exe']) {
    if (spawnSync(c, ['--version'], { encoding: 'utf8' }).status === 0) return c;
  }
  throw new Error('git not found on PATH');
}

const GIT = findGit();

/** Low-level spawn; never throws; records duration. */
function spawnCapture(cmd, args, cwd) {
  const t0 = Date.now();
  const r  = spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  return {
    cmd, args, cwd,
    stdout:     r.stdout  ?? '',
    stderr:     r.stderr  ?? '',
    status:     r.status  ?? null,
    signal:     r.signal  ?? null,
    error:      r.error   ? r.error.message : null,
    durationMs: Date.now() - t0,
  };
}

/** Resolve a branch name to its full SHA; throws on failure. */
function resolveRef(ref) {
  const r = spawnCapture(GIT, ['rev-parse', '--verify', ref], REPO_ROOT);
  if (r.status !== 0 || !r.stdout.trim()) {
    throw new Error(`Cannot resolve ref '${ref}': ${r.stderr.trim()}`);
  }
  return r.stdout.trim();
}

// ---------------------------------------------------------------------------
// Worktree lifecycle
// Dirs are registered BEFORE creation so cleanup is always attempted.
// ---------------------------------------------------------------------------
const worktreeLog = []; // { dir, addResult, removeResult }

function addWorktree(sha) {
  const dir   = mkdtempSync(join(tmpdir(), 'collisionlab-'));
  const entry = { dir, addResult: null, removeResult: null };
  worktreeLog.push(entry);
  entry.addResult = spawnCapture(GIT, ['worktree', 'add', '--detach', dir, sha], REPO_ROOT);
  if (entry.addResult.status !== 0) {
    throw new Error(`git worktree add failed for ${sha}:\n${entry.addResult.stderr}`);
  }
  return { dir, addResult: entry.addResult };
}

function removeWorktree(dir) {
  const entry = worktreeLog.find((e) => e.dir === dir);
  const r     = spawnCapture(GIT, ['worktree', 'remove', '--force', dir], REPO_ROOT);
  if (entry) entry.removeResult = r;
  if (r.status !== 0 && existsSync(dir)) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* fallback failed, recorded */ }
  }
  return r;
}

function cleanupAll() {
  for (const entry of worktreeLog) {
    if (entry.removeResult === null) removeWorktree(entry.dir);
  }
}

process.on('exit', cleanupAll);
process.on('SIGINT',  () => { cleanupAll(); process.exit(130); });
process.on('SIGTERM', () => { cleanupAll(); process.exit(143); });

// ---------------------------------------------------------------------------
// Test runner — dual reporter: TAP to file (machine), spec to stdout (human)
// ---------------------------------------------------------------------------
function runTests(dir, label) {
  const tapFile = join(dir, '_tap_output.txt');
  const r = spawnCapture(
    NODE,
    [
      '--test',
      '--test-reporter=tap',  `--test-reporter-destination=${tapFile}`,
      '--test-reporter=spec', '--test-reporter-destination=stdout',
    ],
    dir,
  );

  let tapRaw = '';
  try { if (existsSync(tapFile)) tapRaw = readFileSync(tapFile, 'utf8'); } catch { /* empty */ }

  return {
    label,
    dir,
    durationMs:  r.durationMs,
    exitCode:    r.status,
    signal:      r.signal   || null,
    spawnError:  r.error    || null,
    stdout:      r.stdout,
    stderr:      r.stderr,
    tapRaw,
    parsed:      parseTap(tapRaw),
  };
}

// ---------------------------------------------------------------------------
// TAP parser — handles Node.js test runner TAP 13 output exactly.
//
// Key quirks of Node's TAP dialect:
//   • The plan line (1..N) appears at the END, after all tests.
//   • Each test has a YAML diagnostic block between "  ---" and "  ...".
//   • For AssertionError failures the YAML contains:
//       actual: ~          (YAML null literal)
//       expected:          (YAML block mapping — value on NEXT lines, indented)
//         id: 'u1'
//         username: 'alice'
//         ...
//       code: 'ERR_ASSERTION'
//   • Summary comment lines: # pass N / # fail N / # tests N
//   • Top-level tests: lines matching /^(ok|not ok) \d+/ (no leading spaces).
//   • Nested subtests: indented lines — excluded from the count.
//
// Returns null (fail-closed) when:
//   • Input is empty or whitespace-only.
//   • No TAP version header AND no top-level test lines.
//   • Plan line present but test count doesn't match planned.
//   • Summary comment counts disagree with counted tests.
// ---------------------------------------------------------------------------
function parseTap(tap) {
  if (!tap || !tap.trim()) return null;

  const lines = tap.split('\n');

  const hasTapVersion = lines.some((l) => l.startsWith('TAP version'));
  const hasTopTestLine = lines.some((l) => /^(ok|not ok) \d+/.test(l));
  if (!hasTapVersion && !hasTopTestLine) return null;

  const tests      = [];
  let inYaml       = false;
  let yamlLines    = [];
  let currentTest  = null;

  for (const raw of lines) {
    // YAML block open/close markers are indented with exactly two spaces
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

    // Only count top-level test lines (no leading whitespace)
    const m = raw.match(/^(ok|not ok) (\d+) - (.*)$/);
    if (m) {
      currentTest = {
        number:         Number(m[2]),
        ok:             m[1] === 'ok',
        name:           m[3].trim(),
        actualIsNull:   false,   // true when actual: ~ (YAML null)
        expectedFields: null,    // object of parsed fields from expected: block
        errorCode:      null,    // 'ERR_ASSERTION' etc.
        diagnosticYaml: null,
      };
      tests.push(currentTest);
    }
  }

  // Plan line (appears at end in Node's TAP)
  const planMatch = tap.match(/^1\.\.(\d+)/m);
  const planned   = planMatch ? Number(planMatch[1]) : null;

  // Summary comment counts (# pass N / # fail N)
  const commentPassMatch = tap.match(/^# pass (\d+)/m);
  const commentFailMatch = tap.match(/^# fail (\d+)/m);
  const commentPass = commentPassMatch ? Number(commentPassMatch[1]) : null;
  const commentFail = commentFailMatch ? Number(commentFailMatch[1]) : null;

  const passed = tests.filter((t) =>  t.ok).length;
  const failed = tests.filter((t) => !t.ok).length;

  // Fail-closed: version header with no test lines and no plan — incomplete stream
  if (tests.length === 0 && planned === null) return null;
  // Fail-closed: plan present but no tests parsed
  if (planned !== null && tests.length === 0) return null;
  // Fail-closed: plan disagrees with parsed test count
  if (planned !== null && tests.length !== planned) return null;
  // Fail-closed: summary comment counts disagree with parsed counts
  if (commentPass !== null && commentPass !== passed) return null;
  if (commentFail !== null && commentFail !== failed) return null;

  return { ok: failed === 0, passed, failed, planned, tests };
}

/**
 * Extract actualIsNull, expectedFields, and errorCode from a YAML diagnostic
 * block's lines (the raw indented lines between "  ---" and "  ...").
 *
 * Node's TAP format for an AssertionError:
 *   actual: ~                ← YAML null literal
 *   expected:
 *     id: 'u1'
 *     username: 'alice'
 *     email: 'alice@example.com'
 *     displayName: 'Alice Chen'
 *   code: 'ERR_ASSERTION'
 *
 * We parse in a two-pass style:
 *   Pass 1 — find scalar fields (actual, code, operator).
 *   Pass 2 — find the "expected:" block-mapping and collect its key: value pairs.
 */
function extractYamlFields(yamlLines, test) {
  let inExpectedBlock = false;
  const expectedFields = {};
  let expectedBlockIndent = null;

  for (let i = 0; i < yamlLines.length; i++) {
    const line = yamlLines[i];

    // actual: ~ means YAML null
    if (/^\s+actual:\s*~\s*$/.test(line)) {
      test.actualIsNull = true;
      inExpectedBlock = false;
      continue;
    }
    // actual: with a non-null inline value — not null
    if (/^\s+actual:\s+\S/.test(line)) {
      test.actualIsNull = false;
      inExpectedBlock = false;
      continue;
    }

    // code: 'ERR_ASSERTION' or code: ERR_ASSERTION
    const codeM = line.match(/^\s+code:\s+'?([^'\s]+)'?\s*$/);
    if (codeM) { test.errorCode = codeM[1]; inExpectedBlock = false; continue; }

    // expected: (no inline value — start of block mapping)
    if (/^\s+expected:\s*$/.test(line)) {
      inExpectedBlock = true;
      expectedBlockIndent = null;
      continue;
    }

    // expected: with an inline scalar value — not the Alice object
    if (/^\s+expected:\s+\S/.test(line)) {
      inExpectedBlock = false;
      continue;
    }

    // Any other top-level YAML key ends the expected block
    if (inExpectedBlock) {
      const lineIndent = line.match(/^(\s+)/)?.[1]?.length ?? 0;
      if (expectedBlockIndent === null && line.trim()) {
        expectedBlockIndent = lineIndent;
      }
      if (expectedBlockIndent !== null && lineIndent <= 2 && line.trim() && lineIndent < expectedBlockIndent) {
        // Back-dedented past the expected block
        inExpectedBlock = false;
      } else if (line.trim()) {
        // Parse "  key: 'value'" or "  key: value"
        const fieldM = line.match(/^\s+(\w+):\s+'?([^']+)'?\s*$/);
        if (fieldM) expectedFields[fieldM[1]] = fieldM[2];
        continue;
      }
    }
  }

  if (Object.keys(expectedFields).length > 0) {
    test.expectedFields = expectedFields;
  }
}

// ---------------------------------------------------------------------------
// Collision fingerprint — structured only, no text fallback in verdicts.
//
// Requires ALL of:
//   1. Exactly one top-level test fails.
//   2. The failing test name matches COLLISION_TEST_NAME exactly.
//   3. actual is the YAML null literal (~).
//   4. expected is a block mapping containing id='u1', username='alice',
//      email='alice@example.com', displayName='Alice Chen'.
//   5. errorCode is 'ERR_ASSERTION'.
// ---------------------------------------------------------------------------
const COLLISION_TEST_NAME =
  'a successful email login loads the cached profile for the signed-in user';

const ALICE = {
  id:          'u1',
  username:    'alice',
  email:       'alice@example.com',
  displayName: 'Alice Chen',
};

function confirmsCollision(parsed) {
  if (!parsed || parsed.failed !== 1) return { ok: false, reason: `failed count: ${parsed?.failed ?? 'null'}` };

  const failing = parsed.tests.find((t) => !t.ok);
  if (!failing) return { ok: false, reason: 'no failing test found in parsed output' };

  if (failing.name !== COLLISION_TEST_NAME) {
    return { ok: false, reason: `wrong test name: "${failing.name}"` };
  }
  if (!failing.actualIsNull) {
    return { ok: false, reason: `actual is not YAML null (~); got: ${JSON.stringify(failing.actualIsNull)}` };
  }
  if (failing.errorCode !== 'ERR_ASSERTION') {
    return { ok: false, reason: `error code is not ERR_ASSERTION; got: ${failing.errorCode}` };
  }
  const ef = failing.expectedFields;
  if (!ef) {
    return { ok: false, reason: 'expected block mapping is absent or unparseable' };
  }
  for (const [k, v] of Object.entries(ALICE)) {
    if (ef[k] !== v) {
      return { ok: false, reason: `expected.${k}: got ${JSON.stringify(ef[k])}, want ${JSON.stringify(v)}` };
    }
  }
  return { ok: true, reason: 'all collision conditions met' };
}

// ---------------------------------------------------------------------------
// Passing-suite process execution check
// ---------------------------------------------------------------------------
function checkProcessOk(tr) {
  if (tr.spawnError) return { ok: false, reason: `spawn error: ${tr.spawnError}` };
  if (tr.signal)     return { ok: false, reason: `process killed by signal: ${tr.signal}` };
  if (tr.exitCode !== 0) return { ok: false, reason: `expected exit 0, got ${tr.exitCode}` };
  return { ok: true };
}

// Step 4 (collision) expects exit code 1 from node --test
function checkCollisionProcessOk(tr) {
  if (tr.spawnError) return { ok: false, reason: `spawn error: ${tr.spawnError}` };
  if (tr.signal)     return { ok: false, reason: `process killed by signal: ${tr.signal}` };
  if (tr.exitCode !== 1) return { ok: false, reason: `expected exit 1 (test failure), got ${tr.exitCode}` };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Control-check script (Step 2)
// ---------------------------------------------------------------------------
const CONTROL_CHECK_SCRIPT = `\
import { loginAndLoadProfile } from './src/profileSession.js';
const profile = loginAndLoadProfile('alice');
const ok = profile !== null && profile.username === 'alice' && profile.id === 'u1';
process.stdout.write(JSON.stringify({ ok, profile }) + '\\n');
process.exit(ok ? 0 : 1);
`;

// ---------------------------------------------------------------------------
// The original failing integration test — verbatim from commit f092166.
// Injected into the merged worktree for Step 4 without touching production code.
// ---------------------------------------------------------------------------
const COLLISION_ASSERTION_MSG =
  'Successful login should load the profile, but the email is not the username cache key';

const FAILING_INTEGRATION_TEST = `\
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { login } from '../src/auth.js';
import { clearProfileCache, getProfileByUsername } from '../src/profileCache.js';
import { loginAndLoadProfile } from '../src/profileSession.js';

beforeEach(() => clearProfileCache());
afterEach(() => clearProfileCache());

test('${COLLISION_TEST_NAME}', () => {
  const loginIdentifier = 'alice@example.com';
  const authenticatedUser = login(loginIdentifier);
  assert.notEqual(authenticatedUser, null, 'Email authentication must succeed');

  const profile = loginAndLoadProfile(loginIdentifier);

  assert.deepEqual(getProfileByUsername('alice'), authenticatedUser);
  assert.deepEqual(
    profile,
    authenticatedUser,
    '${COLLISION_ASSERTION_MSG}',
  );
});
`;

// ---------------------------------------------------------------------------
// Report helpers
// ---------------------------------------------------------------------------
const DIVIDER = '─'.repeat(72);
function section(title) { console.log(`\n${DIVIDER}\n  ${title}\n${DIVIDER}`); }

function saveReports(evidence) {
  const ts = evidence.runTimestamp;
  const jsonPath = join(REPORTS_DIR, `run-${ts}.json`);
  const mdPath   = join(REPORTS_DIR, `run-${ts}.md`);
  try {
    writeFileSync(jsonPath, JSON.stringify(evidence, null, 2));
    console.log(`JSON report saved: ${jsonPath}`);
  } catch (e) { console.error(`Failed to save JSON report: ${e.message}`); }
  try {
    writeFileSync(mdPath, buildMarkdown(evidence));
    console.log(`MD report  saved: ${mdPath}`);
  } catch (e) { console.error(`Failed to save MD report: ${e.message}`); }
  return { jsonPath, mdPath };
}

// ---------------------------------------------------------------------------
// Main execution
// ---------------------------------------------------------------------------
const runTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
console.log('CollisionLab Hardened Evidence Runner');
console.log(`Repository:  ${REPO_ROOT}`);
console.log(`Node:        ${NODE}`);
console.log(`Git:         ${GIT}`);
console.log(`Reports dir: ${REPORTS_DIR}`);

const evidence = {
  runTimestamp,
  repoRoot:    REPO_ROOT,
  nodeVersion: process.version,
  refs:        {},
  steps:       {},
  cleanup:     [],
  overallVerdict: null,
};

// ---------------------------------------------------------------------------
// Pin branch refs — save a partial report and exit on failure
// ---------------------------------------------------------------------------
section('Pinning branch refs to commit SHAs');
try {
  evidence.refs['feature/email-auth']          = resolveRef('feature/email-auth');
  evidence.refs['feature/profile-cache-v2']    = resolveRef('feature/profile-cache-v2');
  evidence.refs['fix/canonical-profile-identity'] = resolveRef('fix/canonical-profile-identity');
  // Hard-pin the integration test source commit (not a live branch ref)
  evidence.refs['integration-test-source'] = 'f0921664867a141ae148d77e83722e4998c6ebb0';
  for (const [k, v] of Object.entries(evidence.refs)) {
    console.log(`  ${k.padEnd(40)} ${v}`);
  }
} catch (err) {
  evidence.overallVerdict = 'FAIL';
  evidence.initError = err.message;
  console.error(`FATAL: ref resolution failed — ${err.message}`);
  saveReports(evidence);
  process.exit(1);
}

// Convenience alias
const REFS = evidence.refs;

// ---------------------------------------------------------------------------
// Helper: verdict builder for passing suites (steps 1, 2, 3, 5)
// ---------------------------------------------------------------------------
function verdictForPassingSuite(tr, extraChecks = []) {
  const proc = checkProcessOk(tr);
  if (!proc.ok)          return { verdict: 'FAIL', reason: proc.reason };
  if (tr.parsed === null) return { verdict: 'FAIL', reason: 'TAP output missing or malformed — fail closed' };
  if (tr.parsed.failed !== 0) return { verdict: 'FAIL', reason: `${tr.parsed.failed} unexpected test failure(s)` };
  for (const check of extraChecks) {
    if (!check.ok) return { verdict: 'FAIL', reason: check.reason };
  }
  return { verdict: 'PASS', reason: `${tr.parsed.passed} tests passed` };
}

// ---------------------------------------------------------------------------
// STEP 1 — feature/email-auth
// ---------------------------------------------------------------------------
section('Step 1 — feature/email-auth — independent test suite');
{
  const step = { id: 'step1', branch: 'feature/email-auth', sha: REFS['feature/email-auth'] };
  evidence.steps.step1 = step;
  try {
    const { dir } = addWorktree(REFS['feature/email-auth']);
    step.worktreeDir = dir;
    console.log(`Worktree: ${dir}`);
    const tr = runTests(dir, 'feature/email-auth');
    step.testRun = tr;
    console.log(tr.stdout);
    const { verdict, reason } = verdictForPassingSuite(tr);
    step.verdict = verdict; step.verdictReason = reason;
  } catch (err) { step.verdict = 'ERROR'; step.verdictReason = err.message; }
  console.log(`Verdict: ${step.verdict} — ${step.verdictReason}`);
}

// ---------------------------------------------------------------------------
// STEP 2 — feature/profile-cache-v2 + control check
// ---------------------------------------------------------------------------
section('Step 2 — feature/profile-cache-v2 — suite + control check');
{
  const step = { id: 'step2', branch: 'feature/profile-cache-v2', sha: REFS['feature/profile-cache-v2'] };
  evidence.steps.step2 = step;
  try {
    const { dir } = addWorktree(REFS['feature/profile-cache-v2']);
    step.worktreeDir = dir;
    console.log(`Worktree: ${dir}`);
    const tr = runTests(dir, 'feature/profile-cache-v2');
    step.testRun = tr;
    console.log(tr.stdout);

    const controlPath = join(dir, '_control_check.mjs');
    writeFileSync(controlPath, CONTROL_CHECK_SCRIPT);
    const cr = spawnCapture(NODE, ['_control_check.mjs'], dir);
    step.controlCheck = cr;
    let controlParsed = null;
    try { controlParsed = JSON.parse(cr.stdout.trim()); } catch { /* stays null */ }
    step.controlCheckParsed = controlParsed;
    const controlOk = cr.status === 0 && cr.signal === null && cr.error === null && controlParsed?.ok === true;
    console.log(`Control check: exit ${cr.status}  ${cr.stdout.trim()}  ${controlOk ? '✅' : '❌'}`);

    const controlCheck = controlOk
      ? { ok: true }
      : { ok: false, reason: `control check failed: loginAndLoadProfile('alice') did not return Alice (exit ${cr.status})` };

    const { verdict, reason } = verdictForPassingSuite(tr, [controlCheck]);
    step.verdict = verdict; step.verdictReason = reason + (verdict === 'PASS' ? '; control check PASS' : '');
  } catch (err) { step.verdict = 'ERROR'; step.verdictReason = err.message; }
  console.log(`Verdict: ${step.verdict} — ${step.verdictReason}`);
}

// ---------------------------------------------------------------------------
// STEP 3 — Merge worktree: conflict probe + unit tests
// ---------------------------------------------------------------------------
section('Step 3 — Merge: feature/email-auth into feature/profile-cache-v2');
let wtMergeDir = null;
{
  const step = { id: 'step3', description: 'merge email-auth into profile-cache-v2' };
  evidence.steps.step3 = step;
  try {
    const { dir } = addWorktree(REFS['feature/profile-cache-v2']);
    wtMergeDir = dir;
    step.worktreeDir = dir;
    console.log(`Worktree: ${dir}`);
    const mergeResult = spawnCapture(
      GIT,
      ['-c', 'user.email=demo@collisionlab.local', '-c', 'user.name=CollisionLab',
       'merge', '--no-edit', REFS['feature/email-auth']],
      dir,
    );
    step.mergeResult   = mergeResult;
    step.hasTextualConflicts = mergeResult.status !== 0;
    console.log(`Merge exit: ${mergeResult.status}  ${mergeResult.stdout.trim()}`);
    console.log(`Textual conflicts: ${step.hasTextualConflicts ? 'YES ❌' : 'NONE ✅'}`);

    if (step.hasTextualConflicts) {
      step.verdict = 'FAIL'; step.verdictReason = 'Unexpected textual conflict during merge';
    } else {
      const tr = runTests(dir, 'merged unit tests');
      step.testRun = tr;
      console.log(tr.stdout);
      const { verdict, reason } = verdictForPassingSuite(tr);
      step.verdict = verdict; step.verdictReason = verdict === 'PASS'
        ? `No conflicts; ${reason}` : reason;
    }
  } catch (err) { step.verdict = 'ERROR'; step.verdictReason = err.message; }
  console.log(`Verdict: ${step.verdict} — ${step.verdictReason}`);
}

// ---------------------------------------------------------------------------
// STEP 4 — Inject original failing integration test; confirm exact collision
// ---------------------------------------------------------------------------
section('Step 4 — Collision reproduction: inject failing integration test');
{
  const step = { id: 'step4', description: 'inject failing integration test into merged worktree' };
  evidence.steps.step4 = step;

  if (!wtMergeDir || !existsSync(wtMergeDir) || evidence.steps.step3?.hasTextualConflicts) {
    step.verdict = 'SKIP';
    step.verdictReason = 'Step 3 merge worktree unavailable or had conflicts';
    console.log(`Skipped: ${step.verdictReason}`);
  } else {
    try {
      const itPath = join(wtMergeDir, 'tests', 'auth-profile.integration.test.js');
      writeFileSync(itPath, FAILING_INTEGRATION_TEST);
      step.injectedFile    = itPath;
      step.injectedContent = FAILING_INTEGRATION_TEST;
      console.log(`Integration test written to: ${itPath}`);
      console.log('(No production code modified)');

      const tr = runTests(wtMergeDir, 'merged + failing integration test');
      step.testRun = tr;
      console.log(tr.stdout);

      // Process execution: must exit 1 (node --test exits 1 when any test fails)
      const procCheck = checkCollisionProcessOk(tr);

      // Structured collision fingerprint — no text fallback in verdict
      const collision  = confirmsCollision(tr.parsed);
      step.collisionCheck = collision;

      if (!procCheck.ok) {
        step.verdict = 'FAIL';
        step.verdictReason = `Process check: ${procCheck.reason}`;
      } else if (tr.parsed === null) {
        step.verdict = 'FAIL';
        step.verdictReason = 'TAP output missing or malformed — cannot confirm collision';
      } else if (!collision.ok) {
        step.verdict = 'FAIL';
        step.verdictReason = `Collision not confirmed: ${collision.reason}`;
      } else {
        step.verdict = 'PASS';
        step.verdictReason =
          `Collision confirmed: "${COLLISION_TEST_NAME}" failed; ` +
          `actual=null, expected=Alice(u1), code=ERR_ASSERTION; ` +
          `${tr.parsed.passed} other tests passed`;
      }
      console.log(`Collision confirmed: ${collision.ok ? 'YES ✅' : 'NO ❌'} — ${collision.reason}`);
    } catch (err) { step.verdict = 'ERROR'; step.verdictReason = err.message; }
  }
  console.log(`Verdict: ${step.verdict} — ${step.verdictReason}`);
}

// ---------------------------------------------------------------------------
// STEP 5 — fix/canonical-profile-identity
// ---------------------------------------------------------------------------
section('Step 5 — fix/canonical-profile-identity — full test suite');
{
  const step = { id: 'step5', branch: 'fix/canonical-profile-identity', sha: REFS['fix/canonical-profile-identity'] };
  evidence.steps.step5 = step;
  try {
    const { dir } = addWorktree(REFS['fix/canonical-profile-identity']);
    step.worktreeDir = dir;
    console.log(`Worktree: ${dir}`);
    const tr = runTests(dir, 'fix/canonical-profile-identity');
    step.testRun = tr;
    console.log(tr.stdout);
    const { verdict, reason } = verdictForPassingSuite(tr);
    step.verdict = verdict; step.verdictReason = reason;
  } catch (err) { step.verdict = 'ERROR'; step.verdictReason = err.message; }
  console.log(`Verdict: ${step.verdict} — ${step.verdictReason}`);
}

// ---------------------------------------------------------------------------
// CLEANUP
// ---------------------------------------------------------------------------
section('Cleanup');
cleanupAll();
evidence.cleanup = worktreeLog.map((e) => ({
  dir:          e.dir,
  removeStatus: e.removeResult?.status ?? null,
  removeError:  e.removeResult?.error  ?? null,
  removeStderr: e.removeResult?.stderr ?? null,
}));
for (const c of evidence.cleanup) {
  const ok = c.removeStatus === 0;
  console.log(`  ${ok ? '✅' : '⚠️ '} ${c.dir}  (exit ${c.removeStatus ?? 'n/a'}${c.removeError ? '  ERR:' + c.removeError : ''})`);
}
const cleanupOk = evidence.cleanup.every((c) => c.removeStatus === 0);

// ---------------------------------------------------------------------------
// OVERALL VERDICT — includes cleanup
// ---------------------------------------------------------------------------
section('Summary Report');

const steps = evidence.steps;
const overallOk =
  steps.step1?.verdict === 'PASS' &&
  steps.step2?.verdict === 'PASS' &&
  steps.step3?.verdict === 'PASS' &&
  steps.step4?.verdict === 'PASS' &&
  steps.step5?.verdict === 'PASS' &&
  cleanupOk;

evidence.overallVerdict = overallOk ? 'PASS' : 'FAIL';

for (const [id, s] of Object.entries(steps)) {
  const icon   = s.verdict === 'PASS' ? '✅' : s.verdict === 'SKIP' ? '⏭️ ' : '❌';
  const parsed = s.testRun?.parsed;
  const counts = parsed ? `${parsed.passed} passed, ${parsed.failed} failed` : (s.testRun ? 'parse failed' : '');
  const timing = s.testRun ? ` [${s.testRun.durationMs}ms]` : '';
  console.log(`\n${icon} ${id.toUpperCase()} — ${s.branch ?? s.description ?? ''}`);
  console.log(`   ${s.verdictReason}${counts ? ' | ' + counts : ''}${timing}`);
}

if (!cleanupOk) {
  console.log('\n❌ CLEANUP failures:');
  for (const c of evidence.cleanup.filter((c) => c.removeStatus !== 0)) {
    console.log(`   ${c.dir}: exit ${c.removeStatus} ${c.removeError ?? c.removeStderr ?? ''}`);
  }
}

console.log(`\n${DIVIDER}`);
console.log(`  Overall: ${overallOk ? '✅  All evidence collected as expected' : '❌  One or more steps produced an unexpected result'}`);
console.log(DIVIDER);

// ---------------------------------------------------------------------------
// SAVE REPORTS & EXIT
// ---------------------------------------------------------------------------
saveReports(evidence);
process.exitCode = overallOk ? 0 : 1;

// ---------------------------------------------------------------------------
// Markdown report builder
// ---------------------------------------------------------------------------
function buildMarkdown(ev) {
  const lines = [];
  lines.push('# CollisionLab Evidence Report');
  lines.push(`\n**Run:** \`${ev.runTimestamp}\`  `);
  lines.push(`**Node:** \`${ev.nodeVersion}\`  `);
  lines.push(`**Overall:** ${ev.overallVerdict === 'PASS' ? '✅ PASS' : '❌ FAIL'}`);
  if (ev.initError) lines.push(`\n**Init error:** \`${ev.initError}\``);

  lines.push('\n## Pinned Refs\n');
  lines.push('| Branch | SHA |');
  lines.push('|--------|-----|');
  for (const [k, v] of Object.entries(ev.refs ?? {})) {
    lines.push(`| \`${k}\` | \`${v}\` |`);
  }

  for (const [id, s] of Object.entries(ev.steps ?? {})) {
    const icon = s.verdict === 'PASS' ? '✅' : s.verdict === 'SKIP' ? '⏭️' : '❌';
    lines.push(`\n## ${id.toUpperCase()} — ${s.branch ?? s.description ?? ''} ${icon}`);
    lines.push(`\n**Verdict:** ${s.verdict} — ${s.verdictReason}  `);
    if (s.sha)         lines.push(`**SHA:** \`${s.sha}\`  `);
    if (s.worktreeDir) lines.push(`**Worktree:** \`${s.worktreeDir}\`  `);

    if (s.mergeResult) {
      lines.push('\n### Merge');
      lines.push('```');
      lines.push(`exit: ${s.mergeResult.status}  duration: ${s.mergeResult.durationMs}ms`);
      if (s.mergeResult.stdout) lines.push(s.mergeResult.stdout.trim());
      lines.push('```');
    }

    if (s.testRun) {
      const tr = s.testRun; const p = tr.parsed;
      lines.push('\n### Test run');
      lines.push(`- Exit code: \`${tr.exitCode}\`  signal: \`${tr.signal ?? 'none'}\`  spawn error: \`${tr.spawnError ?? 'none'}\`  duration: \`${tr.durationMs}ms\``);
      if (p) {
        lines.push(`- Parsed: **${p.passed} passed**, **${p.failed} failed**  (plan: ${p.planned ?? 'n/a'})`);
        if (p.failed > 0) {
          lines.push('\n#### Failing tests');
          for (const t of p.tests.filter((x) => !x.ok)) {
            lines.push(`- \`${t.name}\``);
            lines.push(`  - actualIsNull: \`${t.actualIsNull}\``);
            lines.push(`  - expectedFields: \`${JSON.stringify(t.expectedFields)}\``);
            lines.push(`  - errorCode: \`${t.errorCode}\``);
          }
        }
      } else {
        lines.push('- TAP parse: **FAILED** (malformed or empty)');
      }
      if (tr.spawnError) lines.push(`- Spawn error: \`${tr.spawnError}\``);
      lines.push(`\n<details><summary>stdout</summary>\n\n\`\`\`\n${tr.stdout}\n\`\`\`\n</details>`);
      if (tr.tapRaw) lines.push(`<details><summary>TAP raw</summary>\n\n\`\`\`tap\n${tr.tapRaw}\n\`\`\`\n</details>`);
    }

    if (s.collisionCheck) {
      lines.push(`\n### Collision check: ${s.collisionCheck.ok ? '✅' : '❌'} ${s.collisionCheck.reason}`);
    }
  }

  lines.push('\n## Cleanup\n');
  lines.push('| Worktree | Exit | Error |');
  lines.push('|----------|------|-------|');
  for (const c of (ev.cleanup ?? [])) {
    lines.push(`| \`${c.dir}\` | \`${c.removeStatus ?? 'n/a'}\` | ${c.removeError ?? ''} |`);
  }
  return lines.join('\n') + '\n';
}
