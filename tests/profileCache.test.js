import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cacheProfile, getProfileByUsername, clearProfileCache } from '../src/profileCache.js';
import { cacheUser, getCachedUser, clearCache } from '../src/cache.js';
import { getUserById } from '../src/users.js';

function resetCaches() {
  clearProfileCache();
  clearCache();
}

beforeEach(resetCaches);
afterEach(resetCaches);

test('caches and retrieves a profile by username', () => {
  const user = getUserById('u1');
  cacheProfile(user);
  assert.deepEqual(getProfileByUsername('alice'), user);
});

test('uses username rather than ID or email as the lookup identity', () => {
  const user = getUserById('u1');
  cacheProfile(user);
  assert.equal(getProfileByUsername(user.id), null);
  assert.equal(getProfileByUsername(user.email), null);
});

test('returns null for an uncached username', () => {
  assert.equal(getProfileByUsername('missing'), null);
});

test('retrieves multiple profiles independently', () => {
  cacheProfile(getUserById('u1'));
  cacheProfile(getUserById('u2'));
  cacheProfile(getUserById('u3'));
  assert.equal(getProfileByUsername('alice').id, 'u1');
  assert.equal(getProfileByUsername('bruno').id, 'u2');
  assert.equal(getProfileByUsername('carla').id, 'u3');
});

test('replaces a cached profile for the same username', () => {
  const user = getUserById('u1');
  cacheProfile(user);
  const updated = { ...user, displayName: 'Alice Updated' };
  cacheProfile(updated);
  assert.deepEqual(getProfileByUsername('alice'), updated);
});

test('clears all cached profiles', () => {
  cacheProfile(getUserById('u1'));
  cacheProfile(getUserById('u2'));
  clearProfileCache();
  assert.equal(getProfileByUsername('alice'), null);
  assert.equal(getProfileByUsername('bruno'), null);
});

test('profile and ID-based caches store and clear independently', () => {
  const user = getUserById('u1');
  cacheProfile(user);
  assert.equal(getCachedUser(user.id), null);
  cacheUser(user);
  clearProfileCache();
  assert.equal(getProfileByUsername(user.username), null);
  assert.deepEqual(getCachedUser(user.id), user);
  cacheProfile(user);
  clearCache();
  assert.equal(getCachedUser(user.id), null);
  assert.deepEqual(getProfileByUsername(user.username), user);
});
