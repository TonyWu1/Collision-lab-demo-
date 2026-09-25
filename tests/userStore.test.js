import test from 'node:test';
import assert from 'node:assert/strict';
import { getAllUsers, getUserById, removeUser, resetUsers } from '../src/userStore.js';

test.beforeEach(() => { resetUsers(); });

test('getAllUsers returns all three users initially', () => {
  assert.equal(getAllUsers().length, 3);
});

test('getUserById returns correct user', () => {
  const u = getUserById('u1');
  assert.equal(u.username, 'alice');
});

test('removeUser soft-deletes: record still exists with deleted flag', () => {
  removeUser('u1');
  const u = getUserById('u1');
  assert.ok(u !== null, 'record should still exist after soft delete');
  assert.equal(u.deleted, true);
});

test('removeUser does not change total count in getAllUsers', () => {
  removeUser('u1');
  // getAllUsers returns all records including soft-deleted ones
  assert.equal(getAllUsers().length, 3);
});

test('resetUsers clears deleted flags', () => {
  removeUser('u1');
  resetUsers();
  assert.equal(getUserById('u1').deleted, false);
});
