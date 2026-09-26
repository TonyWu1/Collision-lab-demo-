// Profiles use the username at cache time as their lookup identity.
// This cache is independent of the baseline ID-based user cache.
const profileCache = new Map();

export function cacheProfile(user) {
  profileCache.set(user.username, user);
}

export function getProfileByUsername(username) {
  return profileCache.get(username) ?? null;
}

export function clearProfileCache() {
  profileCache.clear();
}
