# CollisionLab baseline demo

CollisionLab will detect hidden semantic conflicts between Git branches: each
branch works independently and passes its tests, Git merges without a textual
conflict, but the combined behavior breaks the application.

This demo branch merges email authentication and username-based profile caching,
then adds a controlled integration flow with an intentionally incompatible identity
assumption. IBM Bob integration and collision fixes are not implemented.

## Reproduce the controlled collision

```sh
npm test
# Or run only the failing integration test:
node --test tests/auth-profile.integration.test.js
```

The integration test intentionally fails. The existing 19 tests pass.
`loginAndLoadProfile(loginIdentifier)` authenticates the user, caches the profile,
then retrieves it using the original login identifier. It assumes that identifier
is a username. Email authentication accepts `alice@example.com`, but the profile
cache stores Alice under `alice`. Retrieval by email returns `null` even though
authentication and caching both succeeded.

Both feature branches pass independently and merge without textual conflicts.
The features alone do not inherently conflict: looking up the profile by the
returned user's username would be compatible. This demo introduces the stale
identity assumption in `src/profileSession.js` on the combined branch; it was
not already present in either original branch. The failing integration test
exposes that explicit cross-feature assumption. The ID-based cache is unchanged.

## Run

Requires Node.js 20 or newer and npm. There are no dependencies to install.

```sh
cd collisionlab-demo
npm start
npm test
```

The demo finds Alice by ID, logs in with her email, caches her by immutable
ID, and retrieves her from the cache. Tests use Node's built-in test runner.

## Current contracts

- Each sample user has `id`, `username`, `email`, and `displayName`.
- `getUserById(id)`, `getUserByUsername(username)`, and `getUserByEmail(email)`
  return the matching user or `null`. Matching is exact and case-sensitive.
- `login(email)` looks up an email and returns a user or `null`.
  This is a demo lookup, not production password authentication.
- `cacheUser(user)` stores a user in an in-memory Map keyed only by `user.id`.
- `getCachedUser(id)` returns the cached user or `null`.
- `clearCache()` removes all cache entries.
- Sample user IDs cannot be reassigned. Other fields remain editable. User
  lookups and the cache return the in-memory user objects, not copies.
- The data and cache last only for the running process; there is no database.

## Files

```text
collisionlab-demo/
├── src/
│   ├── users.js
│   ├── auth.js
│   ├── cache.js
│   └── app.js
├── tests/
│   ├── users.test.js
│   ├── auth.test.js
│   └── cache.test.js
├── package.json
├── README.md
└── .gitignore
```
