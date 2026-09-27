const users = [
  { id: 'u1', username: 'alice', email: 'alice@example.com', displayName: 'Alice Chen' },
  { id: 'u2', username: 'bruno', email: 'bruno@example.com', displayName: 'Bruno Garcia' },
  { id: 'u3', username: 'carla', email: 'carla@example.com', displayName: 'Carla Smith' },
].map((user) => Object.defineProperty(user, 'id', { writable: false, configurable: false }));

export function getUserById(id) {
  return users.find((user) => user.id === id) ?? null;
}

export function getUserByUsername(username) {
  return users.find((user) => user.username === username) ?? null;
}

export function getUserByEmail(email) {
  return users.find((user) => user.email === email) ?? null;
}
