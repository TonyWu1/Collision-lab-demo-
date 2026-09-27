import { login } from './auth.js';
import { cacheProfile, getProfileByUsername } from './profileCache.js';

// Controlled demo integration: this flow assumes the login identifier is
// also the username used to retrieve the cached profile. Email auth breaks
// that assumption. Keep the mismatch intact until the collision is analyzed.
export function loginAndLoadProfile(loginIdentifier) {
  const user = login(loginIdentifier);
  if (user === null) return null;

  cacheProfile(user);
  return getProfileByUsername(loginIdentifier);
}
