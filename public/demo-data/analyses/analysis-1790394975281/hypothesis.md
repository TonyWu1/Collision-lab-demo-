# Hypothesis: feature/email-auth × feature/profile-cache-v2 (v3 test — explicit skip)

## Branch SHAs (pinned)
- Branch A (`feature/email-auth`): `2fa36c016fee2b361148c6614b3a7f7ba3a2e55a`
- Branch B (`feature/profile-cache-v2`): `ed7e486eb785d0e2dc3edd6ef8c63bbcb7b6b0f9`
- Merge base: `b053926c90f5cf916541430980df1ffdf218152d`

## Refinement from v2 (analysis-1790394782422)

v2 used an early `return` inside the test body when `profileSession.js` was absent. The Node test
runner counted that as a passing test (exit 0), not a skip — so the runner reported 2 passed,
0 skipped on control A. The intent was to communicate that the integration test does not apply
on branch A, but the TAP output gave no signal distinguishing "passed" from "skipped".

This v3 test replaces the early return with `t.skip(...)` using the `TestContext` parameter,
which causes the Node test runner to emit a proper TAP `# skip` directive and count the test
in the skipped bucket. No other assertions or production code are changed.

## Expected control outcomes

- **Control A** — Test 1 PASS (login functional), Test 2 SKIP (t.skip; module absent)
  → Runner reports: 1 passed, 1 skipped, 0 failed
- **Control B** — Test 1 PASS, Test 2 PASS (username credential; cache key matches)
  → Runner reports: 2 passed, 0 skipped, 0 failed
- **Combined** — Test 1 PASS (email auth works), Test 2 FAIL (cache key mismatch post-login)
  → Runner reports: 1 passed, 0 skipped, 1 failed

## Unchanged hypothesis

loginAndLoadProfile passes the raw login identifier to getProfileByUsername. Under email auth the
identifier is an email address but the cache is keyed by username, so the profile lookup returns
null after a successful login.

