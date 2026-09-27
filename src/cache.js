const cache = new Map();

export function cacheUser(user) {
  cache.set(user.id, user);
}

export function getCachedUser(id) {
  return cache.get(id) ?? null;
}

export function clearCache() {
  cache.clear();
}
