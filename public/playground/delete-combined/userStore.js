// User store with soft delete (sets deleted: true instead of removing the record).
// Downstream code that needs "active users" should filter on !u.deleted.
const users = [
  { id: 'u1', username: 'alice', email: 'alice@example.com', deleted: false },
  { id: 'u2', username: 'bruno', email: 'bruno@example.com', deleted: false },
  { id: 'u3', username: 'carla', email: 'carla@example.com', deleted: false },
];

export function getAllUsers() {
  return users.slice();
}

export function getUserById(id) {
  return users.find((u) => u.id === id) ?? null;
}

export function removeUser(id) {
  const user = users.find((u) => u.id === id);
  if (user) user.deleted = true;
}

export function resetUsers() {
  for (const u of users) u.deleted = false;
}
