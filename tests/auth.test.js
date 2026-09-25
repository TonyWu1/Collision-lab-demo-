import test from 'node:test';
import assert from 'node:assert/strict';
import { login } from '../src/auth.js';

test('logs in with a valid email', () => {
  const user = login('alice@example.com');
  assert.equal(user.id, 'u1');
  assert.equal(user.email, 'alice@example.com');
});

test('returns null for a nonexistent email', () => {
  assert.equal(login('missing@example.com'), null);
});

test('username is not accepted as an email', () => {
  assert.equal(login('alice'), null);
});
