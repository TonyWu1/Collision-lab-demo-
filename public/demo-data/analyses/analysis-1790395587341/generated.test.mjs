// Generated behavioral test: feature/soft-delete × feature/reporting
// Tests externally observable behavior of getActiveUserCount() after a user is removed.
// Control A (soft-delete only): reporting.js is absent — test skips gracefully.
// Control B (reporting only): userStore uses physical delete — count drops to 2 after removeUser.
// Combined: userStore uses soft-delete — count stays at 3 after removeUser — collision.
//
// DO NOT modify production source. DO NOT assert the wrong count is correct.
// Same test bytes run on controlA, controlB, and combined worktrees.
// Imports use new URL() to produce valid file:// URLs on all platforms.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const reportingUrl  = new URL('../src/reporting.js',  import.meta.url);
const userStoreUrl  = new URL('../src/userStore.js',   import.meta.url);

const reportingExists = existsSync(fileURLToPath(reportingUrl));

test('getActiveUserCount() returns 2 after one user is removed', async (t) => {
  if (!reportingExists) {
    t.skip('src/reporting.js is absent on this branch — reporting feature not present');
    return;
  }

  const { removeUser, resetUsers } = await import(userStoreUrl.href);
  const { getActiveUserCount } = await import(reportingUrl.href);

  resetUsers();
  removeUser('u1');
  const count = getActiveUserCount();

  assert.equal(
    count, 2,
    `getActiveUserCount() must return 2 after one of three users is removed; got: ${count}. ` +
    `If count is 3, removeUser() did not physically remove the record — soft-delete collision.`
  );
});

test('getUserSummary() excludes removed users', async (t) => {
  if (!reportingExists) {
    t.skip('src/reporting.js is absent on this branch — reporting feature not present');
    return;
  }

  const { removeUser, resetUsers } = await import(userStoreUrl.href);
  const { getUserSummary } = await import(reportingUrl.href);

  resetUsers();
  removeUser('u2');
  const summary = getUserSummary();

  assert.equal(
    summary.total, 2,
    `getUserSummary().total must be 2 after one user is removed; got: ${summary.total}. ` +
    `If total is 3, soft-delete semantics are leaking deleted users into the report.`
  );
  assert.ok(
    !summary.usernames.includes('bruno'),
    `getUserSummary().usernames must not include removed user 'bruno'; got: ${JSON.stringify(summary.usernames)}`
  );
});

