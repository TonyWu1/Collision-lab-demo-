/**
 * generated.test.mjs — behavioral collision test (v3, explicit skip)
 * Generated for: feature/email-auth × feature/profile-cache-v2
 * Analysis: analysis-1790394975281
 * Previous: analysis-1790394782422 (v2), analysis-1790394477074 (v1)
 *
 * Change from v2:
 *   v2 used an early `return` when profileSession.js was absent, which the Node
 *   test runner counted as a passing test. v3 calls t.skip() via the TestContext
 *   parameter so the runner emits a proper TAP skip directive and counts it in
 *   the skipped bucket.
 *
 *   No production code, users, credentials, or other assertions are changed.
 *
 * Expected outcomes:
 *   Control A  — 1 passed, 1 skipped  (login PASS; integration SKIP via t.skip)
 *   Control B  — 2 passed, 0 skipped  (login PASS; integration PASS)
 *   Combined   — 1 passed, 1 failed   (login PASS; integration FAIL — cache key mismatch)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getUserById } from '../src/users.js';
import { login } from '../src/auth.js';

// ── Probe: discover which credential login() accepts for Alice ────────────────
// Try alice.email first, then alice.username. Pick the first that returns non-null.
// Branch names are never inspected. Same bytes run on all three worktrees.
const alice = getUserById('u1');
assert.ok(alice, 'getUserById("u1") must return Alice — fixture data required');

const candidates = [alice.email, alice.username];
let acceptedCredential = null;
for (const c of candidates) {
  if (login(c) !== null) {
    acceptedCredential = c;
    break;
  }
}

// ── Import the integration module if present ──────────────────────────────────
let loginAndLoadProfile = null;
let clearProfileCache = null;
let profileSessionExists = false;
try {
  const session = await import('../src/profileSession.js');
  loginAndLoadProfile = session.loginAndLoadProfile;
  const cache = await import('../src/profileCache.js');
  clearProfileCache = cache.clearProfileCache;
  profileSessionExists = true;
} catch (_) {
  profileSessionExists = false;
}

// ── Test 1: login() accepts a valid credential ────────────────────────────────
// Passes on all three worktrees. Confirms authentication is functional before
// the integration test runs.

test('login() accepts the probed credential and returns Alice', () => {
  assert.ok(
    acceptedCredential !== null,
    `No candidate credential was accepted by login(). ` +
    `Tried: ${JSON.stringify(candidates)}. ` +
    `login() appears broken on this worktree.`
  );
  const user = login(acceptedCredential);
  assert.ok(user !== null, `login("${acceptedCredential}") must return a user`);
  assert.equal(user.id, 'u1', `login("${acceptedCredential}") must resolve to Alice (id: u1)`);
  assert.equal(user.username, 'alice', 'Resolved user must have username "alice"');
  assert.equal(user.email, 'alice@example.com', 'Resolved user must have email "alice@example.com"');
});

// ── Test 2: loginAndLoadProfile() returns the same user ───────────────────────
// Uses the TestContext parameter (t) so t.skip() emits a proper TAP skip
// directive on control A, counting in the skipped bucket (not the pass bucket).
//
// Control A: profileSession.js absent → t.skip() → 1 skipped
// Control B: credential is username   → integration works → 1 passed
// Combined:  credential is email      → cache key mismatch → 1 failed

test('loginAndLoadProfile() returns the same user as login() for the same credential', async (t) => {
  if (!profileSessionExists) {
    t.skip('profileSession.js is absent on this branch');
    return;
  }

  assert.ok(
    acceptedCredential !== null,
    'Cannot run integration test: no credential was accepted by login()'
  );

  if (clearProfileCache) clearProfileCache();

  const profile = loginAndLoadProfile(acceptedCredential);

  // Core assertion (INT-01): after a successful login the profile must be returned.
  assert.ok(
    profile !== null && typeof profile === 'object',
    `loginAndLoadProfile("${acceptedCredential}") must return a user record, got: ${JSON.stringify(profile)}. ` +
    `login() accepted this credential (test 1 passed), so null here means the profile ` +
    `lookup failed after a successful login — the collision.`
  );
  assert.equal(profile.id, 'u1', `Profile must be Alice (id: u1), got: ${JSON.stringify(profile?.id)}`);
  assert.equal(profile.username, 'alice', 'Profile username must be "alice"');
  assert.equal(profile.email, 'alice@example.com', 'Profile email must be "alice@example.com"');

  if (clearProfileCache) clearProfileCache();
});

