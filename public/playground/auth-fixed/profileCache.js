// Profiles are keyed by immutable user.id, satisfying CACHE-01 and ID-01.
// This cache is independent of the baseline ID-based user cache.
const profileCache = new Map();

export function cacheProfile(user) {
  profileCache.set(user.id, user);
}

export function getProfileById(id) {
  return profileCache.get(id) ?? null;
}

export function clearProfileCache() {
  profileCache.clear();
}
