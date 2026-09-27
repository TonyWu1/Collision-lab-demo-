import { login } from './auth.js';
import { cacheProfile, getProfileById } from './profileCache.js';

export function loginAndLoadProfile(loginIdentifier) {
  const user = login(loginIdentifier);
  if (user === null) return null;

  cacheProfile(user);
  return getProfileById(user.id);
}
