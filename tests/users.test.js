import test from 'node:test';
import assert from 'node:assert/strict';
import { getUserById, getUserByUsername, getUserByEmail } from '../src/users.js';

test('looks up a user by ID with all model fields', () => {
  assert.deepEqual(getUserById('u1'), {
    id: 'u1', username: 'alice', email: 'alice@example.com', displayName: 'Alice Chen',
  });
});

test('looks up a user by username', () => {
  assert.equal(getUserByUsername('bruno').id, 'u2');
});

test('looks up a user by email', () => {
  assert.equal(getUserByEmail('carla@example.com').id, 'u3');
});

test('unknown lookups return null', () => {
  assert.equal(getUserById('missing'), null);
  assert.equal(getUserByUsername('missing'), null);
  assert.equal(getUserByEmail('missing@example.com'), null);
});

test('user IDs are immutable', () => {
  const user = getUserById('u1');
  assert.throws(() => { user.id = 'changed'; }, TypeError);
  assert.equal(user.id, 'u1');
});
