import { getUserByEmail } from './users.js';

export function login(email) {
  return getUserByEmail(email);
}
