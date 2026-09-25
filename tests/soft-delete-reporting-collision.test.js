// Integration test: soft-delete / reporting collision
//
// feature/soft-delete changed removeUser() to set deleted:true instead of splicing.
// feature/reporting implemented getActiveUserCount() by calling getAllUsers().length,
// assuming physical delete so that only "live" users remain in the list.
// Both branches pass their unit tests in isolation. After merging, getAllUsers()
// still returns soft-deleted records, so getActiveUserCount() overcounts active users.

import test from 'node:test';
import assert from 'node:assert/strict';
import { removeUser, resetUsers } from '../src/userStore.js';
import { getActiveUserCount, getUserSummary } from '../src/reporting.js';

test.beforeEach(() => { resetUsers(); });

test('COLLISION: active user count is wrong after a removal', () => {
  removeUser('u1');   // soft-deleted on this merged branch

  const count = getActiveUserCount();

  // This assertion FAILS after merging: count is 3, not 2.
  // getActiveUserCount() calls getAllUsers().length, which returns all records
  // including soft-deleted ones. The reporting module was written assuming
  // physical delete, so it never filters on !deleted.
  assert.equal(count, 2,
    `Expected 2 active users after removing one, but got ${count} — soft-deleted record still counted`);
});

test('COLLISION evidence: getUserSummary includes deleted user in list', () => {
  removeUser('u2');   // soft-delete bruno

  const summary = getUserSummary();

  // After the merge, bruno is still in usernames even though he was "deleted"
  assert.ok(summary.usernames.includes('bruno'),
    'Expected bruno to still appear in summary (soft-delete leak)');
  assert.equal(summary.total, 3,
    `Expected overcounted total of 3, got ${summary.total}`);
});
