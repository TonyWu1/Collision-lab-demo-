#!/usr/bin/env node
/**
 * CollisionLab evidence runner
 *
 * Runs each demonstration step in an isolated Git worktree so the main
 * repository working tree is never touched. All worktrees are cleaned up
 * on exit regardless of outcome.
 *
 * Steps
 *  1  feature/email-auth          — independent test suite
 *  2  feature/profile-cache-v2    — independent test suite + username-flow control check
 *  3  merge worktree               — email-auth merged into profile-cache-v2; conflict probe + tests
 *  4  merge worktree (continued)   — inject original failing integration test; re-run tests
 *  5  fix/canonical-profile-identity — full test suite (must be green)
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const NODE = process.execPath;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run a command; return { stdout, stderr, status }. Never throws. */
function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? 1,
  };
}

/** Run a command and throw if it fails. */
function runOrThrow(cmd, args, cwd) {
  const r = run(cmd, args, cwd);
  if (r.status !== 0) {
    throw new Error(
      `Command failed (exit ${r.status}):\n  ${cmd} ${args.join(' ')}\n${r.stderr}`,
    );
  }
  return r;
}

/** Find the git executable (handles Windows where npm scripts may lack PATH). */
function findGit() {
  for (const candidate of ['git', 'C:\\Program Files\\Git\\bin\\git.exe']) {
    const r = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
    if (r.status === 0) return candidate;
  }
  throw new Error('git not found');
}

const GIT = findGit();

/** Create a temporary worktree for the given branch ref; return its path. */
function addWorktree(branch) {
  const dir = mkdtempSync(join(tmpdir(), 'collisionlab-'));
  runOrThrow(GIT, ['worktree', 'add', '--detach', dir, branch], REPO_ROOT);
  return dir;
}

/** Remove a worktree directory and prune the git worktree record. */
function removeWorktree(dir) {
  if (existsSync(dir)) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  try { runOrThrow(GIT, ['worktree', 'prune'], REPO_ROOT); } catch { /* ignore */ }
}

/** Run `node --test` in a directory; return { stdout, stderr, passed, failed }. */
function runTests(dir) {
  const r = run(NODE, ['--test'], dir);
  const combined = r.stdout + r.stderr;
  const passMatch = combined.match(/^ℹ pass (\d+)/m);
  const failMatch = combined.match(/^ℹ fail (\d+)/m);
  return {
    stdout: r.stdout,
    stderr: r.stderr,
    status: r.status,
    passed: passMatch ? Number(passMatch[1]) : 0,
    failed: failMatch ? Number(failMatch[1]) : 0,
    combined,
  };
}

// ---------------------------------------------------------------------------
// Report helpers
// ---------------------------------------------------------------------------

const DIVIDER = '─'.repeat(72);

function section(title) {
  console.log(`\n${DIVIDER}`);
  console.log(`  ${title}`);
  console.log(DIVIDER);
}

function printTestSummary(label, result) {
  const icon = result.failed === 0 ? '✅' : '❌';
  console.log(`${icon}  ${label}: ${result.passed} passed, ${result.failed} failed`);
  if (result.failed > 0) {
    // Print only the failing-test lines for brevity
    const lines = result.combined.split('\n');
    const failLines = lines.filter(
      (l) => l.startsWith('✖') || l.includes('AssertionError') || l.includes('actual:') || l.includes('expected:'),
    );
    if (failLines.length) {
      console.log('  Failure detail:');
      failLines.slice(0, 20).forEach((l) => console.log(`    ${l.trim()}`));
    }
  }
}

// ---------------------------------------------------------------------------
// The original failing integration test — taken verbatim from the
// demo/true-semantic-collision branch (commit f092166).  Injected into the
// merged worktree for Step 4 to reproduce the collision without modifying
// production code.
// ---------------------------------------------------------------------------
const FAILING_INTEGRATION_TEST = `\
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { login } from '../src/auth.js';
import { clearProfileCache, getProfileByUsername } from '../src/profileCache.js';
import { loginAndLoadProfile } from '../src/profileSession.js';

beforeEach(() => clearProfileCache());
afterEach(() => clearProfileCache());

test('a successful email login loads the cached profile for the signed-in user', () => {
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
    'Successful login should load the profile, but the email is not the username cache key',
  );
});
`;

// ---------------------------------------------------------------------------
// Control-check script — run inside feature/profile-cache-v2 worktree.
// Verifies loginAndLoadProfile('alice') returns Alice's profile.
// ---------------------------------------------------------------------------
const CONTROL_CHECK_SCRIPT = `\
import { loginAndLoadProfile } from './src/profileSession.js';
const profile = loginAndLoadProfile('alice');
const ok = profile !== null && profile.username === 'alice' && profile.id === 'u1';
process.stdout.write(JSON.stringify({ ok, profile }) + '\\n');
process.exit(ok ? 0 : 1);
`;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const worktrees = [];

function cleanup() {
  for (const dir of worktrees) removeWorktree(dir);
}

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });
process.on('SIGTERM', () => { cleanup(); process.exit(143); });

console.log('CollisionLab Evidence Runner');
console.log(`Repository: ${REPO_ROOT}`);
console.log(`Node:       ${NODE}`);
console.log(`Git:        ${GIT}`);

const report = {
  stepA: null,
  stepB: null,
  stepBControl: null,
  stepC_conflicts: null,
  stepC_tests: null,
  stepD_tests: null,
  stepE_tests: null,
};

// ===========================================================================
// STEP 1 — feature/email-auth independent test suite
// ===========================================================================
section('Step 1 — feature/email-auth (Branch A) — independent test suite');

let wtA;
try {
  wtA = addWorktree('feature/email-auth');
  worktrees.push(wtA);
  console.log(`Worktree: ${wtA}`);

  const result = runTests(wtA);
  printTestSummary('feature/email-auth', result);
  console.log('\nFull output:');
  console.log(result.combined);
  report.stepA = { passed: result.passed, failed: result.failed };
} catch (err) {
  console.error('Step 1 failed:', err.message);
  report.stepA = { error: err.message };
}

// ===========================================================================
// STEP 2 — feature/profile-cache-v2 independent test suite + control check
// ===========================================================================
section('Step 2 — feature/profile-cache-v2 (Branch B) — independent test suite + control check');

let wtB;
try {
  wtB = addWorktree('feature/profile-cache-v2');
  worktrees.push(wtB);
  console.log(`Worktree: ${wtB}`);

  // 2a — test suite
  const testResult = runTests(wtB);
  printTestSummary('feature/profile-cache-v2', testResult);
  console.log('\nFull output:');
  console.log(testResult.combined);
  report.stepB = { passed: testResult.passed, failed: testResult.failed };

  // 2b — control check: loginAndLoadProfile('alice') must return Alice's profile
  const controlPath = join(wtB, '_control_check.mjs');
  writeFileSync(controlPath, CONTROL_CHECK_SCRIPT);
  const controlResult = run(NODE, ['_control_check.mjs'], wtB);
  let controlParsed;
  try { controlParsed = JSON.parse(controlResult.stdout.trim()); } catch { controlParsed = null; }
  const controlOk = controlResult.status === 0 && controlParsed?.ok === true;
  console.log(`\n${controlOk ? '✅' : '❌'}  Control check — loginAndLoadProfile('alice'):`);
  console.log(`  Raw output: ${controlResult.stdout.trim()}`);
  console.log(`  Result:     ${controlOk ? 'PASS — returns Alice\'s profile' : 'FAIL'}`);
  report.stepBControl = { ok: controlOk, profile: controlParsed?.profile ?? null };
} catch (err) {
  console.error('Step 2 failed:', err.message);
  report.stepB = { error: err.message };
}

// ===========================================================================
// STEP 3 — Merge worktree: detect textual conflicts, run baseline tests
// ===========================================================================
section('Step 3 — Merge worktree: feature/email-auth + feature/profile-cache-v2');

let wtMerge;
try {
  // Start from feature/profile-cache-v2 so the merge mirrors demo/true-semantic-collision
  wtMerge = addWorktree('feature/profile-cache-v2');
  worktrees.push(wtMerge);
  console.log(`Worktree: ${wtMerge}`);

  // Perform the merge with no commit so we can inspect the outcome
  const mergeResult = run(
    GIT,
    ['-c', 'user.email=demo@collisionlab.local', '-c', 'user.name=CollisionLab',
     'merge', '--no-edit', 'feature/email-auth'],
    wtMerge,
  );

  const hasConflicts = mergeResult.status !== 0;
  console.log(`Merge exit code: ${mergeResult.status}`);
  console.log(`Textual conflicts: ${hasConflicts ? 'YES ❌' : 'NONE ✅'}`);
  if (mergeResult.stdout) console.log(mergeResult.stdout.trim());
  if (mergeResult.stderr) console.log(mergeResult.stderr.trim());
  report.stepC_conflicts = hasConflicts;

  if (!hasConflicts) {
    // Run the merged test suite (no integration test yet — just the unit tests from both branches)
    const testResult = runTests(wtMerge);
    printTestSummary('merged (unit tests only)', testResult);
    console.log('\nFull output:');
    console.log(testResult.combined);
    report.stepC_tests = { passed: testResult.passed, failed: testResult.failed };
  }
} catch (err) {
  console.error('Step 3 failed:', err.message);
  report.stepC_conflicts = 'error';
  report.stepC_tests = { error: err.message };
}

// ===========================================================================
// STEP 4 — Inject the original failing integration test into the merged worktree
// ===========================================================================
section('Step 4 — Failing integration test injected into merged worktree');

if (wtMerge && existsSync(wtMerge) && !report.stepC_conflicts) {
  try {
    const integrationTestPath = join(wtMerge, 'tests', 'auth-profile.integration.test.js');
    writeFileSync(integrationTestPath, FAILING_INTEGRATION_TEST);
    console.log(`Integration test written to: ${integrationTestPath}`);
    console.log('(No production code modified)');

    const testResult = runTests(wtMerge);
    printTestSummary('merged + original failing integration test', testResult);
    console.log('\nFull output:');
    console.log(testResult.combined);
    report.stepD_tests = { passed: testResult.passed, failed: testResult.failed };

    // Surface the failing assertion explicitly
    if (testResult.failed > 0) {
      console.log('\n⚠️  Integration test failure confirms the semantic collision:');
      console.log('   loginAndLoadProfile("alice@example.com") returns null');
      console.log('   because the email is not the username cache key.');
    }
  } catch (err) {
    console.error('Step 4 failed:', err.message);
    report.stepD_tests = { error: err.message };
  }
} else {
  console.log('Skipped — Step 3 merge worktree unavailable or had conflicts.');
  report.stepD_tests = { skipped: true };
}

// ===========================================================================
// STEP 5 — fix/canonical-profile-identity full test suite
// ===========================================================================
section('Step 5 — fix/canonical-profile-identity — full test suite');

let wtFix;
try {
  wtFix = addWorktree('fix/canonical-profile-identity');
  worktrees.push(wtFix);
  console.log(`Worktree: ${wtFix}`);

  const testResult = runTests(wtFix);
  printTestSummary('fix/canonical-profile-identity', testResult);
  console.log('\nFull output:');
  console.log(testResult.combined);
  report.stepE_tests = { passed: testResult.passed, failed: testResult.failed };
} catch (err) {
  console.error('Step 5 failed:', err.message);
  report.stepE_tests = { error: err.message };
}

// ===========================================================================
// SUMMARY REPORT
// ===========================================================================
section('Summary Report');

console.log('\nStep 1 — feature/email-auth (Branch A)');
if (report.stepA?.error) {
  console.log(`  ERROR: ${report.stepA.error}`);
} else {
  console.log(`  Tests: ${report.stepA?.passed} passed, ${report.stepA?.failed} failed  ${report.stepA?.failed === 0 ? '✅' : '❌'}`);
}

console.log('\nStep 2 — feature/profile-cache-v2 (Branch B)');
if (report.stepB?.error) {
  console.log(`  ERROR: ${report.stepB.error}`);
} else {
  console.log(`  Tests: ${report.stepB?.passed} passed, ${report.stepB?.failed} failed  ${report.stepB?.failed === 0 ? '✅' : '❌'}`);
  console.log(`  Control check — loginAndLoadProfile('alice'): ${report.stepBControl?.ok ? 'PASS ✅' : 'FAIL ❌'}`);
  if (report.stepBControl?.profile) {
    console.log(`  Returned profile: ${JSON.stringify(report.stepBControl.profile)}`);
  }
}

console.log('\nStep 3 — Merge (feature/email-auth into feature/profile-cache-v2)');
console.log(`  Textual conflicts: ${report.stepC_conflicts === false ? 'NONE ✅' : report.stepC_conflicts === true ? 'YES ❌' : String(report.stepC_conflicts)}`);
if (report.stepC_tests?.error) {
  console.log(`  Tests: ERROR — ${report.stepC_tests.error}`);
} else if (report.stepC_tests) {
  console.log(`  Unit tests in merged tree: ${report.stepC_tests.passed} passed, ${report.stepC_tests.failed} failed  ${report.stepC_tests.failed === 0 ? '✅' : '❌'}`);
}

console.log('\nStep 4 — Failing integration test against merged code');
if (report.stepD_tests?.skipped) {
  console.log('  Skipped (merge step unavailable)');
} else if (report.stepD_tests?.error) {
  console.log(`  ERROR: ${report.stepD_tests.error}`);
} else {
  const expectedFail = report.stepD_tests?.failed > 0;
  console.log(`  Tests: ${report.stepD_tests?.passed} passed, ${report.stepD_tests?.failed} failed  ${expectedFail ? '✅ (expected failure confirms collision)' : '❌ (unexpected — should have failed)'}`);
}

console.log('\nStep 5 — fix/canonical-profile-identity');
if (report.stepE_tests?.error) {
  console.log(`  ERROR: ${report.stepE_tests.error}`);
} else {
  console.log(`  Tests: ${report.stepE_tests?.passed} passed, ${report.stepE_tests?.failed} failed  ${report.stepE_tests?.failed === 0 ? '✅' : '❌'}`);
}

const overallOk =
  report.stepA?.failed === 0 &&
  report.stepB?.failed === 0 &&
  report.stepBControl?.ok === true &&
  report.stepC_conflicts === false &&
  report.stepC_tests?.failed === 0 &&
  report.stepD_tests?.failed > 0 &&
  report.stepE_tests?.failed === 0;

console.log(`\n${DIVIDER}`);
console.log(`  Overall: ${overallOk ? '✅  All evidence collected as expected' : '⚠️   One or more steps produced an unexpected result'}`);
console.log(DIVIDER);
