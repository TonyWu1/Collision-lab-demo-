import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { login } from '../src/auth.js';
import { clearProfileCache, getProfileById } from '../src/profileCache.js';
import { loginAndLoadProfile } from '../src/profileSession.js';

beforeEach(() => clearProfileCache());
afterEach(() => clearProfileCache());

test('a successful email login loads the cached profile for the signed-in user', () => {
  const loginIdentifier = 'alice@example.com';
  const authenticatedUser = login(loginIdentifier);
  assert.notEqual(authenticatedUser, null, 'Email authentication must succeed');

  const profile = loginAndLoadProfile(loginIdentifier);

  // Prove the profile was cached successfully under its immutable ID before
  // asserting the user-visible outcome of the integration flow.
  assert.deepEqual(getProfileById(authenticatedUser.id), authenticatedUser);
  assert.deepEqual(
    profile,
    authenticatedUser,
    'Successful login should load the profile, but the email is not the username cache key',
  );
});
