// User reporting. Computes summary statistics over the user store.
// Assumes that removeUser physically removes the record from the store,
// so getAllUsers() always returns only active (non-deleted) users.
import { getAllUsers } from './userStore.js';

export function getActiveUserCount() {
  return getAllUsers().length;
}

export function getUserSummary() {
  const users = getAllUsers();
  return {
    total: users.length,
    usernames: users.map((u) => u.username),
  };
}
