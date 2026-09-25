import test from 'node:test';
import assert from 'node:assert/strict';
import { login } from '../src/auth.js';

test('logs in with a valid username', () => {
  const user = login('alice');
  assert.equal(user.id, 'u1');
  assert.equal(user.username, 'alice');
});

test('returns null for a nonexistent username', () => {
  assert.equal(login('missing'), null);
});

test('email is not accepted as a username', () => {
  assert.equal(login('alice@example.com'), null);
});
