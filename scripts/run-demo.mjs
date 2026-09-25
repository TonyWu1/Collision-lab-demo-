#!/usr/bin/env node
/**
 * CollisionLab hardened evidence runner — scripts/run-demo.mjs
 *
 * Runs five demonstration steps, each in a temporary Git worktree.
 * Branch refs are pinned to full commit SHAs at startup.
 * Saves JSON and Markdown reports to scripts/reports/ on every run.
 * Exits with code 0 only when all five steps produce the expected outcome.
 * Exits with code 1 for any unexpected result, including malformed output.
 *
 * Steps
 *  1  feature/email-auth             — independent test suite (must: all pass)
 *  2  feature/profile-cache-v2       — independent suite + username-flow control check
 *  3  merge worktree                 — email-auth merged into profile-cache-v2;
 *                                      no textual conflicts; unit tests all pass
 *  4  merge worktree (continued)     — inject original failing integration test;
 *                                      exactly one failure: the semantic collision assertion
 *  5  fix/canonical-profile-identity — full suite, all pass
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
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = resolve(__dirname, '..');
const REPORTS_DIR = join(__dirname, 'reports');
const NODE = process.execPath;
mkdirSync(REPORTS_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

/** Find git; tries PATH then common Windows location. */
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
    cmd,
    args,
    cwd,
    stdout:   r.stdout  ?? '',
    stderr:   r.stderr  ?? '',
    status:   r.status  ?? null,
    signal:   r.signal  ?? null,
    error:    r.error   ? r.error.message : null,
    durationMs: Date.now() - t0,
  };
}

/** Resolve a branch name to its full SHA; throws if not found. */
function resolveRef(ref) {
  const r = spawnCapture(GIT, ['rev-parse', '--verify', ref], REPO_ROOT);
  if (r.status !== 0 || !r.stdout.trim()) {
    throw new Error(`Cannot resolve ref '${ref}': ${r.stderr.trim()}`);
  }
  return r.stdout.trim();
}

// ---------------------------------------------------------------------------
// Worktree lifecycle
// Tracks each dir BEFORE creation so cleanup is always attempted.
// ---------------------------------------------------------------------------
const worktreeLog = []; // { dir, addResult, removeResult }

/** Create a detached worktree at a temp dir; returns { dir, addResult }. */
function addWorktree(sha) {
  const dir = mkdtempSync(join(tmpdir(), 'collisionlab-'));
  const entry = { dir, addResult: null, removeResult: null };
  worktreeLog.push(entry);
  entry.addResult = spawnCapture(GIT, ['worktree', 'add', '--detach', dir, sha], REPO_ROOT);
  if (entry.addResult.status !== 0) {
    throw new Error(
      `git worktree add failed for ${sha}:\n${entry.addResult.stderr}`,
    );
  }
  return { dir, addResult: entry.addResult };
}

/** Remove a single worktree by directory. Records result in worktreeLog entry. */
function removeWorktree(dir) {
  const entry = worktreeLog.find((e) => e.dir === dir);
  const r = spawnCapture(GIT, ['worktree', 'remove', '--force', dir], REPO_ROOT);
  if (entry) entry.removeResult = r;
  // If worktree remove failed (e.g. already gone), try rmSync as fallback
  if (r.status !== 0 && existsSync(dir)) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* recorded below */ }
  }
  return r;
}

/** Remove all tracked worktrees; never throws. */
function cleanupAll() {
  for (const entry of worktreeLog) {
    if (entry.removeResult === null) {
      entry.removeResult = removeWorktree(entry.dir);
    }
  }
}

process.on('exit', cleanupAll);
process.on('SIGINT',  () => { cleanupAll(); process.exit(130); });
process.on('SIGTERM', () => { cleanupAll(); process.exit(143); });

// ---------------------------------------------------------------------------
// Test runner  — uses TAP reporter for machine parsing + spec for humans
// ---------------------------------------------------------------------------

/**
 * Run `node --test` with both TAP and spec reporters.
 * Returns a rich result object; parsing failures are recorded, never throw.
 */
function runTests(dir, label) {
  const t0 = Date.now();
  // TAP output goes to a temp file; spec goes to stdout for display
  const tapFile = join(dir, '_tap_output.txt');

  const r = spawnCapture(
    NODE,
    [
      '--test',
      '--test-reporter=tap', `--test-reporter-destination=${tapFile}`,
      '--test-reporter=spec', '--test-reporter-destination=stdout',
    ],
    dir,
  );
  const durationMs = Date.now() - t0;

  let tapRaw = '';
  try {
    if (existsSync(tapFile)) tapRaw = readFileSync(tapFile, 'utf8');
  } catch { /* tapRaw stays empty */ }

  const parsed = parseTap(tapRaw);

  return {
    label,
    dir,
    durationMs,
    exitCode:  r.status,
    signal:    r.signal,
    spawnError: r.error,
    stdout:    r.stdout,
    stderr:    r.stderr,
    tapRaw,
    parsed,       // { ok: bool, passed: int|null, failed: int|null, tests: [...] } | null
  };
}

// ---------------------------------------------------------------------------
// TAP parser
// ---------------------------------------------------------------------------

/**
 * Parse TAP 13 output produced by Node's test runner.
 * Returns:
 *   { ok, passed, failed, tests }
 *   or null if the TAP stream is empty/malformed (fail-closed).
 *
 * Each test entry: { number, ok, name, actual, expected, diagnosticYaml }
 */
function parseTap(tap) {
  if (!tap || !tap.trim()) return null;

  const lines = tap.split('\n');

  // Must start with "TAP version" or contain at least one test line
  const hasTapVersion = lines.some((l) => l.startsWith('TAP version'));
  const hasTestLine   = lines.some((l) => /^(ok|not ok) \d+/.test(l));
  if (!hasTapVersion && !hasTestLine) return null;

  const tests = [];
  let inYaml     = false;
  let yamlLines  = [];
  let currentTest = null;

  for (const raw of lines) {
    const line = raw;

    if (line === '  ---') { inYaml = true; yamlLines = []; continue; }
    if (line === '  ...') {
      inYaml = false;
      if (currentTest) {
        currentTest.diagnosticYaml = yamlLines.join('\n');
        // Extract actual/expected from the YAML block
        for (const yl of yamlLines) {
          const actualM   = yl.match(/^\s+actual:\s+(.+)$/);
          const expectedM = yl.match(/^\s+expected:\s+(.+)$/);
          if (actualM)   currentTest.actual   = actualM[1].trim();
          if (expectedM) currentTest.expected = expectedM[1].trim();
        }
      }
      yamlLines = [];
      continue;
    }
    if (inYaml) { yamlLines.push(line); continue; }

    const m = line.match(/^(ok|not ok) (\d+) - (.*)$/);
    if (m) {
      currentTest = {
        number:   Number(m[2]),
        ok:       m[1] === 'ok',
        name:     m[3].trim(),
        actual:   null,
        expected: null,
        diagnosticYaml: null,
      };
      // Skip Node's synthetic suite wrappers (they have # SKIP or nested names)
      // Only count leaf test lines (no leading spaces before ok/not ok)
      if (!raw.startsWith(' ')) tests.push(currentTest);
      continue;
    }
  }

  // Also parse the plan line: 1..N
  const planMatch = tap.match(/^1\.\.(\d+)/m);
  const planned = planMatch ? Number(planMatch[1]) : null;

  const passed = tests.filter((t) => t.ok).length;
  const failed = tests.filter((t) => !t.ok).length;

  // Fail-closed: if we got a plan but no test lines at all, that is malformed
  if (planned !== null && tests.length === 0) return null;

  return {
    ok:      failed === 0,
    passed,
    failed,
    planned,
    tests,
  };
}

// ---------------------------------------------------------------------------
// Collision fingerprint check
// ---------------------------------------------------------------------------
const COLLISION_TEST_NAME =
  'a successful email login loads the cached profile for the signed-in user';
const COLLISION_ACTUAL_RE   = /^null$/;
const COLLISION_EXPECTED_RE = /u1/; // Alice's user object contains 'u1'

/**
 * Returns true only if:
 *  - parsed is valid
 *  - exactly one test fails
 *  - the failing test is the known collision test
 *  - its actual value is null
 *  - its expected value mentions u1 (Alice's profile)
 */
function confirmsCollision(parsed) {
  if (!parsed || parsed.failed !== 1) return false;
  const failing = parsed.tests.find((t) => !t.ok);
  if (!failing) return false;
  if (failing.name !== COLLISION_TEST_NAME) return false;
  if (!COLLISION_ACTUAL_RE.test(failing.actual ?? '')) return false;
  if (!COLLISION_EXPECTED_RE.test(failing.expected ?? '')) {
    // Fall back: scan the full YAML for the Alice object
    const yaml = failing.diagnosticYaml ?? '';
    if (!yaml.includes('u1')) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Collision-specific TAP fingerprint — for diagnostics only
// Node's spec reporter puts actual/expected on stderr; TAP puts them in YAML.
// We also scan stderr for the canonical assertion message.
// ---------------------------------------------------------------------------
const COLLISION_ASSERTION_MSG =
  'Successful login should load the profile, but the email is not the username cache key';

function confirmsCollisionFromOutput(testResult) {
  // Primary path: structured TAP parse
  if (confirmsCollision(testResult.parsed)) return true;
  // Fallback: if TAP parse yielded nothing but stderr has the exact message + null
  const combined = testResult.stdout + testResult.stderr;
  return (
    combined.includes(COLLISION_ASSERTION_MSG) &&
    combined.includes('actual: null') &&
    combined.includes('u1')
  );
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
// The original failing integration test — verbatim from commit f092166
// (demo/true-semantic-collision, pre-fix). Injected into the merged worktree
// for Step 4 without touching any production code.
// ---------------------------------------------------------------------------
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

  // Prove the profile was cached successfully under its username before
  // asserting the user-visible outcome of the integration flow.
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
function section(title) {
  console.log(`\n${DIVIDER}\n  ${title}\n${DIVIDER}`);
}

// ---------------------------------------------------------------------------
// Main execution
// ---------------------------------------------------------------------------

const runTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
const jsonReportPath = join(REPORTS_DIR, `run-${runTimestamp}.json`);
const mdReportPath   = join(REPORTS_DIR, `run-${runTimestamp}.md`);

console.log('CollisionLab Hardened Evidence Runner');
console.log(`Repository:  ${REPO_ROOT}`);
console.log(`Node:        ${NODE}`);
console.log(`Git:         ${GIT}`);
console.log(`JSON report: ${jsonReportPath}`);
console.log(`MD report:   ${mdReportPath}`);

// ---------------------------------------------------------------------------
// Pin branch refs to full commit SHAs
// ---------------------------------------------------------------------------
section('Pinning branch refs to commit SHAs');

const REFS = {};
try {
  REFS['feature/email-auth']          = resolveRef('feature/email-auth');
  REFS['feature/profile-cache-v2']    = resolveRef('feature/profile-cache-v2');
  REFS['fix/canonical-profile-identity'] = resolveRef('fix/canonical-profile-identity');
  REFS['integration-test-source']     = 'f0921664867a141ae148d77e83722e4998c6ebb0'; // demo/true-semantic-collision @ f092166
  for (const [name, sha] of Object.entries(REFS)) {
    console.log(`  ${name.padEnd(40)} ${sha}`);
  }
} catch (err) {
  console.error(`FATAL: ref resolution failed — ${err.message}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Accumulate full structured report
// ---------------------------------------------------------------------------
const evidence = {
  runTimestamp,
  repoRoot:  REPO_ROOT,
  nodeVersion: process.version,
  refs: REFS,
  steps: {},
  cleanup: [],
  overallVerdict: null,
};

// ---------------------------------------------------------------------------
// STEP 1 — feature/email-auth independent test suite
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

    if (tr.parsed === null) {
      step.verdict = 'FAIL';
      step.verdictReason = 'TAP output missing or malformed — fail closed';
    } else if (tr.parsed.failed !== 0) {
      step.verdict = 'FAIL';
      step.verdictReason = `${tr.parsed.failed} unexpected test failure(s)`;
    } else {
      step.verdict = 'PASS';
      step.verdictReason = `${tr.parsed.passed} tests passed`;
    }
    console.log(`Verdict: ${step.verdict} — ${step.verdictReason}`);
  } catch (err) {
    step.verdict = 'ERROR';
    step.verdictReason = err.message;
    console.error(`Step 1 error: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// STEP 2 — feature/profile-cache-v2 independent suite + control check
// ---------------------------------------------------------------------------
section('Step 2 — feature/profile-cache-v2 — suite + control check');

{
  const step = { id: 'step2', branch: 'feature/profile-cache-v2', sha: REFS['feature/profile-cache-v2'] };
  evidence.steps.step2 = step;
  try {
    const { dir } = addWorktree(REFS['feature/profile-cache-v2']);
    step.worktreeDir = dir;
    console.log(`Worktree: ${dir}`);

    // 2a — unit tests
    const tr = runTests(dir, 'feature/profile-cache-v2');
    step.testRun = tr;
    console.log(tr.stdout);

    // 2b — control check
    const controlPath = join(dir, '_control_check.mjs');
    writeFileSync(controlPath, CONTROL_CHECK_SCRIPT);
    const cr = spawnCapture(NODE, ['_control_check.mjs'], dir);
    step.controlCheck = cr;
    let controlParsed = null;
    try { controlParsed = JSON.parse(cr.stdout.trim()); } catch { /* stays null */ }
    step.controlCheckParsed = controlParsed;
    const controlOk = cr.status === 0 && controlParsed?.ok === true;
    console.log(`\nControl check — loginAndLoadProfile('alice'):`);
    console.log(`  exit code: ${cr.status}  duration: ${cr.durationMs}ms`);
    console.log(`  output: ${cr.stdout.trim()}`);
    console.log(`  result: ${controlOk ? 'PASS ✅' : 'FAIL ❌'}`);

    if (tr.parsed === null) {
      step.verdict = 'FAIL';
      step.verdictReason = 'TAP output missing or malformed';
    } else if (tr.parsed.failed !== 0) {
      step.verdict = 'FAIL';
      step.verdictReason = `${tr.parsed.failed} unexpected test failure(s)`;
    } else if (!controlOk) {
      step.verdict = 'FAIL';
      step.verdictReason = `Control check failed: loginAndLoadProfile('alice') did not return Alice`;
    } else {
      step.verdict = 'PASS';
      step.verdictReason = `${tr.parsed.passed} tests passed; control check PASS`;
    }
    console.log(`Verdict: ${step.verdict} — ${step.verdictReason}`);
  } catch (err) {
    step.verdict = 'ERROR';
    step.verdictReason = err.message;
    console.error(`Step 2 error: ${err.message}`);
  }
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
      ['-c', 'user.email=demo@collisionlab.local',
       '-c', 'user.name=CollisionLab',
       'merge', '--no-edit', REFS['feature/email-auth']],
      dir,
    );
    step.mergeResult = mergeResult;
    const hasConflicts = mergeResult.status !== 0;
    step.hasTextualConflicts = hasConflicts;

    console.log(`Merge exit code: ${mergeResult.status}  duration: ${mergeResult.durationMs}ms`);
    console.log(`Textual conflicts: ${hasConflicts ? 'YES ❌' : 'NONE ✅'}`);
    if (mergeResult.stdout) console.log(mergeResult.stdout.trim());
    if (mergeResult.stderr) console.log(mergeResult.stderr.trim());

    if (hasConflicts) {
      step.verdict = 'FAIL';
      step.verdictReason = 'Unexpected textual conflict during merge';
    } else {
      const tr = runTests(dir, 'merged unit tests');
      step.testRun = tr;
      console.log(tr.stdout);

      if (tr.parsed === null) {
        step.verdict = 'FAIL';
        step.verdictReason = 'TAP output missing or malformed after merge';
      } else if (tr.parsed.failed !== 0) {
        step.verdict = 'FAIL';
        step.verdictReason = `${tr.parsed.failed} unit test failure(s) in merged tree`;
      } else {
        step.verdict = 'PASS';
        step.verdictReason = `No conflicts; ${tr.parsed.passed} unit tests passed`;
      }
    }
    console.log(`Verdict: ${step.verdict} — ${step.verdictReason}`);
  } catch (err) {
    step.verdict = 'ERROR';
    step.verdictReason = err.message;
    console.error(`Step 3 error: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// STEP 4 — Inject original failing integration test; confirm exact collision
// ---------------------------------------------------------------------------
section('Step 4 — Collision reproduction: inject failing integration test');

{
  const step = { id: 'step4', description: 'inject failing integration test into merged worktree' };
  evidence.steps.step4 = step;

  if (wtMergeDir === null || !existsSync(wtMergeDir) || evidence.steps.step3?.hasTextualConflicts) {
    step.verdict = 'SKIP';
    step.verdictReason = 'Step 3 merge worktree unavailable or had conflicts';
    console.log(`Skipped: ${step.verdictReason}`);
  } else {
    try {
      const integrationTestPath = join(wtMergeDir, 'tests', 'auth-profile.integration.test.js');
      writeFileSync(integrationTestPath, FAILING_INTEGRATION_TEST);
      step.injectedFile = integrationTestPath;
      step.injectedContent = FAILING_INTEGRATION_TEST;
      console.log(`Integration test written to: ${integrationTestPath}`);
      console.log('(No production code modified)');

      const tr = runTests(wtMergeDir, 'merged + failing integration test');
      step.testRun = tr;
      console.log(tr.stdout);
      if (tr.stderr) console.log(tr.stderr);

      const collisionConfirmed = confirmsCollisionFromOutput(tr);
      step.collisionConfirmed = collisionConfirmed;

      if (tr.parsed === null) {
        step.verdict = 'FAIL';
        step.verdictReason = 'TAP output missing or malformed — cannot confirm collision';
      } else if (!collisionConfirmed) {
        step.verdict = 'FAIL';
        if (tr.parsed.failed === 0) {
          step.verdictReason = 'No test failed — collision not reproduced';
        } else {
          // Some test failed but it was not the expected collision
          const failing = tr.parsed.tests.filter((t) => !t.ok);
          step.verdictReason =
            `${failing.length} failure(s) but not the expected collision assertion ` +
            `(got: ${failing.map((t) => `"${t.name}"`).join(', ')})`;
        }
      } else {
        step.verdict = 'PASS'; // "pass" means the collision is confirmed as expected
        step.verdictReason =
          `Collision confirmed: test "${COLLISION_TEST_NAME}" failed with actual=null, ` +
          `expected=Alice (u1); ${tr.parsed.passed} other tests passed`;
      }
      console.log(`Collision confirmed: ${collisionConfirmed ? 'YES ✅' : 'NO ❌'}`);
      console.log(`Verdict: ${step.verdict} — ${step.verdictReason}`);
    } catch (err) {
      step.verdict = 'ERROR';
      step.verdictReason = err.message;
      console.error(`Step 4 error: ${err.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// STEP 5 — fix/canonical-profile-identity full test suite
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

    if (tr.parsed === null) {
      step.verdict = 'FAIL';
      step.verdictReason = 'TAP output missing or malformed';
    } else if (tr.parsed.failed !== 0) {
      step.verdict = 'FAIL';
      step.verdictReason = `${tr.parsed.failed} unexpected test failure(s) on fix branch`;
    } else {
      step.verdict = 'PASS';
      step.verdictReason = `${tr.parsed.passed} tests passed`;
    }
    console.log(`Verdict: ${step.verdict} — ${step.verdictReason}`);
  } catch (err) {
    step.verdict = 'ERROR';
    step.verdictReason = err.message;
    console.error(`Step 5 error: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// CLEANUP — remove only worktrees created by this run
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
  console.log(`  ${ok ? '✅' : '⚠️ '} ${c.dir}  (exit ${c.removeStatus ?? 'n/a'}${c.removeError ? ' ERR:' + c.removeError : ''})`);
}

// ---------------------------------------------------------------------------
// OVERALL VERDICT
// ---------------------------------------------------------------------------
section('Summary Report');

const steps = evidence.steps;
const overallOk =
  steps.step1?.verdict === 'PASS' &&
  steps.step2?.verdict === 'PASS' &&
  steps.step3?.verdict === 'PASS' &&
  steps.step4?.verdict === 'PASS' &&  // collision confirmed
  steps.step5?.verdict === 'PASS';

evidence.overallVerdict = overallOk ? 'PASS' : 'FAIL';

for (const [id, s] of Object.entries(steps)) {
  const icon = s.verdict === 'PASS' ? '✅' : s.verdict === 'SKIP' ? '⏭️ ' : '❌';
  const parsed = s.testRun?.parsed;
  const counts = parsed
    ? `${parsed.passed} passed, ${parsed.failed} failed`
    : (s.testRun ? 'parse failed' : '');
  const timing = s.testRun ? ` [${s.testRun.durationMs}ms]` : '';
  console.log(`\n${icon} ${id.toUpperCase()} — ${s.branch ?? s.description ?? ''}`);
  console.log(`   ${s.verdictReason}${counts ? ' | ' + counts : ''}${timing}`);
}

const cleanupErrors = evidence.cleanup.filter((c) => c.removeStatus !== 0);
if (cleanupErrors.length) {
  console.log(`\n⚠️  Cleanup errors (${cleanupErrors.length}):`);
  for (const c of cleanupErrors) {
    console.log(`   ${c.dir}: exit ${c.removeStatus} ${c.removeError ?? c.removeStderr ?? ''}`);
  }
}

console.log(`\n${DIVIDER}`);
console.log(`  Overall: ${overallOk ? '✅  All evidence collected as expected' : '❌  One or more steps produced an unexpected result'}`);
console.log(DIVIDER);

// ---------------------------------------------------------------------------
// SAVE REPORTS
// ---------------------------------------------------------------------------

// JSON
writeFileSync(jsonReportPath, JSON.stringify(evidence, null, 2));
console.log(`\nJSON report saved: ${jsonReportPath}`);

// Markdown
const md = buildMarkdown(evidence);
writeFileSync(mdReportPath, md);
console.log(`MD report  saved: ${mdReportPath}`);

// ---------------------------------------------------------------------------
// EXIT CODE
// ---------------------------------------------------------------------------
process.exitCode = overallOk ? 0 : 1;

// ---------------------------------------------------------------------------
// Markdown report builder
// ---------------------------------------------------------------------------
function buildMarkdown(ev) {
  const ts   = ev.runTimestamp;
  const lines = [];

  lines.push(`# CollisionLab Evidence Report`);
  lines.push(`\n**Run:** \`${ts}\`  `);
  lines.push(`**Node:** \`${ev.nodeVersion}\`  `);
  lines.push(`**Overall:** ${ev.overallVerdict === 'PASS' ? '✅ PASS' : '❌ FAIL'}`);

  lines.push(`\n## Pinned Refs\n`);
  lines.push(`| Branch | SHA |`);
  lines.push(`|--------|-----|`);
  for (const [k, v] of Object.entries(ev.refs)) {
    lines.push(`| \`${k}\` | \`${v}\` |`);
  }

  for (const [id, s] of Object.entries(ev.steps)) {
    const icon = s.verdict === 'PASS' ? '✅' : s.verdict === 'SKIP' ? '⏭️' : '❌';
    lines.push(`\n## ${id.toUpperCase()} — ${s.branch ?? s.description ?? ''} ${icon}`);
    lines.push(`\n**Verdict:** ${s.verdict} — ${s.verdictReason}  `);
    if (s.sha) lines.push(`**SHA:** \`${s.sha}\`  `);
    if (s.worktreeDir) lines.push(`**Worktree:** \`${s.worktreeDir}\`  `);

    if (s.mergeResult) {
      lines.push(`\n### Merge command`);
      lines.push(`\`\`\``);
      lines.push(`exit: ${s.mergeResult.status}  duration: ${s.mergeResult.durationMs}ms`);
      if (s.mergeResult.stdout) lines.push(s.mergeResult.stdout.trim());
      if (s.mergeResult.stderr) lines.push(s.mergeResult.stderr.trim());
      lines.push(`\`\`\``);
    }

    if (s.testRun) {
      const tr = s.testRun;
      const p  = tr.parsed;
      lines.push(`\n### Test run`);
      lines.push(`- Exit code: \`${tr.exitCode}\`  duration: \`${tr.durationMs}ms\``);
      if (p) {
        lines.push(`- Parsed: **${p.passed} passed**, **${p.failed} failed**  (plan: ${p.planned ?? 'n/a'})`);
        if (p.failed > 0) {
          lines.push(`\n#### Failing tests`);
          for (const t of p.tests.filter((x) => !x.ok)) {
            lines.push(`- \`${t.name}\``);
            if (t.actual   !== null) lines.push(`  - actual: \`${t.actual}\``);
            if (t.expected !== null) lines.push(`  - expected: \`${t.expected}\``);
          }
        }
      } else {
        lines.push(`- TAP parse: **FAILED** (malformed or empty output)`);
      }
      if (tr.spawnError) lines.push(`- Spawn error: \`${tr.spawnError}\``);
      lines.push(`\n<details><summary>stdout</summary>\n\n\`\`\`\n${tr.stdout}\n\`\`\`\n</details>`);
      if (tr.tapRaw) {
        lines.push(`<details><summary>TAP raw</summary>\n\n\`\`\`tap\n${tr.tapRaw}\n\`\`\`\n</details>`);
      }
    }

    if (s.controlCheck) {
      const cr = s.controlCheck;
      lines.push(`\n### Control check`);
      lines.push(`- Exit code: \`${cr.status}\`  duration: \`${cr.durationMs}ms\``);
      lines.push(`- Output: \`${cr.stdout.trim()}\``);
    }

    if (s.collisionConfirmed !== undefined) {
      lines.push(`\n### Collision confirmation`);
      lines.push(`- Test name: \`${COLLISION_TEST_NAME}\``);
      lines.push(`- Confirmed: **${s.collisionConfirmed ? 'YES' : 'NO'}**`);
    }
  }

  lines.push(`\n## Cleanup\n`);
  lines.push(`| Worktree | Exit | Error |`);
  lines.push(`|----------|------|-------|`);
  for (const c of ev.cleanup) {
    lines.push(`| \`${c.dir}\` | \`${c.removeStatus ?? 'n/a'}\` | ${c.removeError ?? ''} |`);
  }

  return lines.join('\n') + '\n';
}
