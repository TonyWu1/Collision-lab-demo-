# CollisionLab baseline demo

CollisionLab will detect hidden semantic conflicts between Git branches: each
branch works independently and passes its tests, Git merges without a textual
conflict, but the combined behavior breaks the application.

## Evidence dashboard

Requires Node.js 20 or newer. No dependencies to install.

```sh
cd collisionlab-demo
node scripts/server.mjs        # or: npm run dashboard
```

Open **http://localhost:7432/** in a browser.

The dashboard is a **known-scenario evidence viewer** for this specific demo.
It does not automatically discover new conflicts or call external services.

- **Select a report** from the dropdown to view a previously saved run.
- **Click "Run demo now"** to invoke `scripts/run-demo.mjs`, stream its output
  live, and load the new report when it finishes.
- A green "Evidence run completed" banner means the runner collected all five
  expected observations — it does **not** mean the merged application passed.
  Step 4 intentionally shows a failing integration test (the semantic collision).

## CLI commands

```sh
npm run demo        # run the evidence runner directly (no browser needed)
npm test            # run the test suite for the current branch
npm start           # run src/app.js
```

## Run

Requires Node.js 20 or newer and npm. There are no dependencies to install.

```sh
cd collisionlab-demo
npm start
npm test
```

The demo finds Alice by ID, logs in with her username, caches her by immutable
ID, and retrieves her from the cache. Tests use Node's built-in test runner.

## Baseline contracts

- Each sample user has `id`, `username`, `email`, and `displayName`.
- `getUserById(id)`, `getUserByUsername(username)`, and `getUserByEmail(email)`
  return the matching user or `null`. Matching is exact and case-sensitive.
- `login(username)` looks up a username and returns a user or `null`.
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
