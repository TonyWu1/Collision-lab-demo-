import test from 'node:test';
import assert from 'node:assert/strict';
import { resetUsers, removeUser } from '../src/userStore.js';
import { getActiveUserCount, getUserSummary } from '../src/reporting.js';

test.beforeEach(() => { resetUsers(); });

test('getActiveUserCount returns 3 with no deletions', () => {
  assert.equal(getActiveUserCount(), 3);
});

test('getActiveUserCount decrements after a user is removed', () => {
  removeUser('u1');
  // On main, removeUser physically splices — so count should drop to 2
  assert.equal(getActiveUserCount(), 2);
});

test('getUserSummary lists all active usernames', () => {
  const summary = getUserSummary();
  assert.deepEqual(summary.usernames.sort(), ['alice', 'bruno', 'carla']);
});

test('getUserSummary excludes removed users', () => {
  removeUser('u2');
  const summary = getUserSummary();
  assert.equal(summary.total, 2);
  assert.ok(!summary.usernames.includes('bruno'));
});
