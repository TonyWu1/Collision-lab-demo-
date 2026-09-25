import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cacheProfile, getProfileById, clearProfileCache } from '../src/profileCache.js';
import { cacheUser, getCachedUser, clearCache } from '../src/cache.js';
import { getUserById } from '../src/users.js';

function resetCaches() {
  clearProfileCache();
  clearCache();
}

beforeEach(resetCaches);
afterEach(resetCaches);

test('caches and retrieves a profile by ID', () => {
  const user = getUserById('u1');
  cacheProfile(user);
  assert.deepEqual(getProfileById('u1'), user);
});

test('uses immutable user ID rather than username or email as the lookup identity', () => {
  const user = getUserById('u1');
  cacheProfile(user);
  assert.equal(getProfileById(user.username), null);
  assert.equal(getProfileById(user.email), null);
  assert.deepEqual(getProfileById(user.id), user);
});

test('returns null for an uncached ID', () => {
  assert.equal(getProfileById('missing'), null);
});

test('retrieves multiple profiles independently', () => {
  cacheProfile(getUserById('u1'));
  cacheProfile(getUserById('u2'));
  cacheProfile(getUserById('u3'));
  assert.equal(getProfileById('u1').username, 'alice');
  assert.equal(getProfileById('u2').username, 'bruno');
  assert.equal(getProfileById('u3').username, 'carla');
});

test('replaces a cached profile for the same ID', () => {
  const user = getUserById('u1');
  cacheProfile(user);
  const updated = { ...user, displayName: 'Alice Updated' };
  cacheProfile(updated);
  assert.deepEqual(getProfileById('u1'), updated);
});

test('clears all cached profiles', () => {
  cacheProfile(getUserById('u1'));
  cacheProfile(getUserById('u2'));
  clearProfileCache();
  assert.equal(getProfileById('u1'), null);
  assert.equal(getProfileById('u2'), null);
});

test('profile and ID-based caches store and clear independently', () => {
  const user = getUserById('u1');
  cacheProfile(user);
  assert.equal(getCachedUser(user.id), null);
  cacheUser(user);
  clearProfileCache();
  assert.equal(getProfileById(user.id), null);
  assert.deepEqual(getCachedUser(user.id), user);
  cacheProfile(user);
  clearCache();
  assert.equal(getCachedUser(user.id), null);
  assert.deepEqual(getProfileById(user.id), user);
});

test('profile retrieval is unaffected when username or email changes', () => {
  const original = getUserById('u1');
  cacheProfile(original);

  // Simulate attribute mutation without changing the ID
  const mutated = { ...original, username: 'alice-renamed', email: 'alice-new@example.com' };
  cacheProfile(mutated);

  // The same ID still resolves to the updated profile
  assert.deepEqual(getProfileById('u1'), mutated);
  // The old username and new username do not resolve to anything
  assert.equal(getProfileById('alice'), null);
  assert.equal(getProfileById('alice-renamed'), null);
});
