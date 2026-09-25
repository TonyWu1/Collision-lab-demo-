import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { cacheUser, getCachedUser, clearCache } from '../src/cache.js';
import { getUserById } from '../src/users.js';

beforeEach(() => clearCache());

test('caches and retrieves a user by ID', () => {
  const user = getUserById('u1');
  cacheUser(user);
  assert.deepEqual(getCachedUser('u1'), user);
  assert.equal(getCachedUser(user.username), null);
  assert.equal(getCachedUser(user.email), null);
});

test('retrieves multiple users independently', () => {
  cacheUser(getUserById('u1'));
  cacheUser(getUserById('u2'));
  assert.equal(getCachedUser('u1').username, 'alice');
  assert.equal(getCachedUser('u2').username, 'bruno');
});

test('returns null for a cache miss', () => {
  assert.equal(getCachedUser('missing'), null);
});

test('clears all cached users', () => {
  cacheUser(getUserById('u1'));
  cacheUser(getUserById('u2'));
  clearCache();
  assert.equal(getCachedUser('u1'), null);
  assert.equal(getCachedUser('u2'), null);
});
