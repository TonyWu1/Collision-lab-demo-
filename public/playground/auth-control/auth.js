import { getUserByUsername } from './users.js';

export function login(username) {
  return getUserByUsername(username);
}
