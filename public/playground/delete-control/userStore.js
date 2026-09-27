// User store with physical delete.
const users = [
  { id: 'u1', username: 'alice', email: 'alice@example.com' },
  { id: 'u2', username: 'bruno', email: 'bruno@example.com' },
  { id: 'u3', username: 'carla', email: 'carla@example.com' },
];

export function getAllUsers() {
  return users.slice();
}

export function getUserById(id) {
  return users.find((u) => u.id === id) ?? null;
}

export function removeUser(id) {
  const idx = users.findIndex((u) => u.id === id);
  if (idx !== -1) users.splice(idx, 1);
}

export function resetUsers() {
  users.splice(0);
  users.push(
    { id: 'u1', username: 'alice', email: 'alice@example.com' },
    { id: 'u2', username: 'bruno', email: 'bruno@example.com' },
    { id: 'u3', username: 'carla', email: 'carla@example.com' },
  );
}
