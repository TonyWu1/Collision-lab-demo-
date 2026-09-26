# Phase 13 Benchmark Results

**Branch:** `fix/runner-scenarios`  
**Workflow:** `/collision` reusable Bob collision workflow (`.bob/commands/collision.md`)  
**Date:** 2026-09-26  
**Node.js helper:** `scripts/collision-workflow.mjs`  
**Nature of results:** Known-fixture repeatability — all three scenarios are prepared demos with pre-seeded conflicts. These results measure whether the workflow correctly reproduces expected verdicts, not whether Bob blindly discovered unknown conflicts.

---

## Summary

| Scenario | Pair | Analysis Directory | Verdict | Existing Tests Detect Collision |
|---|---|---|---|---|
| 1 | `feature/email-auth` + `feature/profile-cache-v2` | `analysis-1790394975281` | **CONFIRMED** | No |
| 2 | `feature/price-object-v2` + `feature/cart` | `analysis-1790395659460` | **CONFIRMED** | No |
| 3 | `feature/soft-delete` + `feature/reporting` | `analysis-1790395587341` | **CONFIRMED** | **Yes** |

All three scenarios reproduce the expected collision verdict. No scenario is inconclusive.

---

## Scenario 1: feature/email-auth × feature/profile-cache-v2

**Analysis directory:** `scripts/reports/analysis-1790394975281`  
**Reused as-is** — this is the analysis-1790394975281 run specified by the task.

### Branches

| | Ref | SHA |
|---|---|---|
| A | `feature/email-auth` | `2fa36c0` |
| B | `feature/profile-cache-v2` | `ed7e486` |
| merge-base | | `b053926` |

**Requirements:** `demo/combined-auth-cache:requirements/authentication-v2.md` (blob `1f3552d`, sha256 `7e2ccb7…`)

### Collision

`feature/email-auth` changes `auth.js` to accept email addresses as login identifiers.  
`feature/profile-cache-v2` adds `profileSession.js` / `profileCache.js`, keying the profile cache by `user.username`.  
After merging, `loginAndLoadProfile("alice@example.com")` returns `null` after a successful login — the cache was keyed by username but looked up by email.

**Fixture disclosure:** The collision is a prepared demo. Existing comments on the branches and the requirements document explicitly describe the incompatibility. This measures repeatability.

### Test results

| Suite | Tests | Passed | Failed | Skipped |
|---|---|---|---|---|
| Branch A existing | 12 | 12 | 0 | 0 |
| Branch B existing | 19 | 19 | 0 | 0 |
| Merged existing | 19 | 19 | 0 | 0 |
| Control A generated | 2 | 1 | 0 | 1 |
| Control B generated | 2 | 2 | 0 | 0 |
| **Combined generated** | **2** | **1** | **1** | **0** |

**Existing merged tests:** No collision detected (19/19 pass). The profile-cache tests assert username-keyed behavior; email-based lookup is not tested in the existing suite.

**Generated test failure (combined):**
```
error: 'loginAndLoadProfile("alice@example.com") must return a user record, got: null.
       login() accepted this credential (test 1 passed), so null here means the
       profile lookup failed after a successful login — the collision.'
```
Failure type: `testCodeFailure / ERR_ASSERTION` — semantic assertion failure.

**Control pattern:** `A: 1/1/0 | B: 2/0/0 | combined: 1/0/1` — matches expected.

**Requirement violations:** INT-01 (profile lookup returns null after login), AUTH-02 (profile session treats loginIdentifier as username), CACHE-01 (profile cache keys by username, not user.id).

### Execution durations (helper-measured)

| Phase | Duration |
|---|---|
| Branch A suite | 2,709 ms |
| Branch B suite | 3,434 ms |
| Merged existing suite | 3,435 ms |
| Control A generated | 1,421 ms |
| Control B generated | 1,460 ms |
| Combined generated | 1,391 ms |
| Merge operation | 258 ms |
| **Total helper verify** | ~14,108 ms (startedAt → finishedAt) |
| Bob analysis time | **unavailable** — not instrumented |

**Subagents:** Not recorded in prior run. Per `docs/collision-workflow.md`: "Subagent execution is reported only when actually available and used."

**Verdict:** CONFIRMED

---

## Scenario 2: feature/price-object-v2 × feature/cart

**Analysis directory:** `scripts/reports/analysis-1790395659460`  
**Phase 13 fresh run.**

### Branches

| | Ref | SHA |
|---|---|---|
| A | `feature/price-object-v2` | `0f23c69` |
| B | `feature/cart` | `bd96dff` |
| merge-base | | `2333e05` |

**Requirements:** none supplied.

### Collision

`feature/price-object-v2` changes `src/catalog.js` so product prices are `{ amount, currency }` objects.  
`feature/cart` introduces `src/cart.js` with `getTotal()` computing `product.price * quantity` — direct numeric multiplication with an explicit comment "Assumes product.price is a numeric value in USD."  
After merging, feeding a catalog product into the cart computes `{ amount: 20, currency: 'USD' } * 1` → `NaN`.

**Fixture disclosure:** This is a prepared fixture. The incompatibility is announced by the comment in `src/cart.js`.

### Test results

| Suite | Tests | Passed | Failed | Skipped |
|---|---|---|---|---|
| Branch A existing | 15 | 15 | 0 | 0 |
| Branch B existing | 17 | 17 | 0 | 0 |
| Merged existing | 20 | 20 | 0 | 0 |
| Control A generated | 2 | 0 | 0 | 2 |
| Control B generated | 2 | 2 | 0 | 0 |
| **Combined generated** | **2** | **0** | **2** | **0** |

**Existing merged tests:** No collision detected (20/20 pass). Cart's own tests use hardcoded numeric fixtures (`{ price: 20 }`), not catalog products. They pass even on merged code.

**Generated test failures (combined):**
```
error: 'getTotal() must return a positive finite number when one catalog product is added;
       got: NaN (type: number). product.price is: {"amount":20,"currency":"USD"}.
       If total is NaN, cart.getTotal() is multiplying a non-numeric price — this is the collision.'
```
Failure type: `testCodeFailure / ERR_ASSERTION` — semantic assertion failure.

**Control pattern:** `A: 0/2/0 | B: 2/0/0 | combined: 0/2/0` — matches expected.

### Prior attempt note

A first attempt (`analysis-1790395577528`) failed on controls B and combined with `ERR_UNSUPPORTED_ESM_URL_SCHEME`. This was a **setup error in the generated test**: `path.resolve()` produces bare Windows drive paths (e.g., `C:\…`) which are not valid ESM `import()` URL schemes. The test was rewritten to use `new URL('../src/…', import.meta.url)`, and the analysis was re-prepared as `analysis-1790395659460`. The prior run is preserved. This distinction — setup error vs. semantic assertion failure — matters for the verdict: `FAILURE_REQUIRES_REVIEW` on a setup error cannot be promoted to CONFIRMED.

### Execution durations (helper-measured)

| Phase | Duration |
|---|---|
| Branch A suite | 3,311 ms |
| Branch B suite | 3,377 ms |
| Merged existing suite | 3,968 ms |
| Control A generated | 1,411 ms |
| Control B generated | 1,427 ms |
| Combined generated | 1,434 ms |
| Merge operation | 258 ms |
| **Total helper verify** | ~16,330 ms |
| Bob analysis time | **unavailable** — not instrumented |

**Subagents:** Not dispatched. Sequential analysis performed directly by Bob.

**Verdict:** CONFIRMED

---

## Scenario 3: feature/soft-delete × feature/reporting

**Analysis directory:** `scripts/reports/analysis-1790395587341`  
**Phase 13 fresh run.**

### Branches

| | Ref | SHA |
|---|---|---|
| A | `feature/soft-delete` | `5e3c257` |
| B | `feature/reporting` | `dbbbbfd` |
| merge-base | | `2333e05` |

**Requirements:** none supplied.

### Collision

`feature/soft-delete` changes `removeUser(id)` to set `user.deleted = true` instead of splicing. `getAllUsers()` returns all records including soft-deleted ones.  
`feature/reporting` introduces `getActiveUserCount()` backed by `getAllUsers().length`, with an explicit assumption that physical deletion is in effect.  
After merging, `getActiveUserCount()` returns 3 after a user is "removed", breaking reporting accuracy.

**Fixture disclosure:** Explicitly pre-announced. `src/reporting.js` comment: "Assumes that removeUser physically removes the record from the store." `tests/reporting.test.js` comment: "On main, removeUser physically splices — so count should drop to 2." This measures repeatability.

### Test results

| Suite | Tests | Passed | Failed | Skipped |
|---|---|---|---|---|
| Branch A existing | 17 | 17 | 0 | 0 |
| Branch B existing | 16 | 16 | 0 | 0 |
| **Merged existing** | **21** | **19** | **2** | **0** |
| Control A generated | 2 | 0 | 0 | 2 |
| Control B generated | 2 | 2 | 0 | 0 |
| **Combined generated** | **2** | **0** | **2** | **0** |

⚠️ **Existing merged tests detect the collision.** Two tests in `tests/reporting.test.js` fail on merged code:

1. `getActiveUserCount decrements after a user is removed` — `3 !== 2` (`ERR_ASSERTION`)
2. `getUserSummary excludes removed users` — `3 !== 2` (`ERR_ASSERTION`)

These are semantic assertion failures — actual counts returned are wrong, not import or setup errors. This is the only scenario among the three where the existing test suite catches the collision on its own.

**Generated test failures (combined):**
```
error: 'getActiveUserCount() must return 2 after one of three users is removed; got: 3.
       If count is 3, removeUser() did not physically remove the record — soft-delete collision.
       3 !== 2'
```
Failure type: `testCodeFailure / ERR_ASSERTION` — semantic assertion failure.

**Control pattern:** `A: 0/2/0 | B: 2/0/0 | combined: 0/2/0` — matches expected.

### Execution durations (helper-measured)

| Phase | Duration |
|---|---|
| Branch A suite | 3,338 ms |
| Branch B suite | 3,263 ms |
| Merged existing suite | 4,062 ms |
| Control A generated | 1,393 ms |
| Control B generated | 1,398 ms |
| Combined generated | 1,400 ms |
| **Total helper verify** | ~13,255 ms |
| Bob analysis time | **unavailable** — not instrumented |

**Subagents:** Not dispatched. Sequential analysis performed directly by Bob.

**Verdict:** CONFIRMED

---

## Cross-scenario comparison

| Scenario | Pair | Existing tests catch collision | Generated test control pattern | Verdict |
|---|---|---|---|---|
| 1 (email-auth × profile-cache-v2) | `feature/email-auth` + `feature/profile-cache-v2` | No (19/19 pass) | A:1p1s / B:2p / C:1p1f | CONFIRMED |
| 2 (price-object-v2 × cart) | `feature/price-object-v2` + `feature/cart` | No (20/20 pass) | A:2s / B:2p / C:2f | CONFIRMED |
| 3 (soft-delete × reporting) | `feature/soft-delete` + `feature/reporting` | **Yes (2 fail)** | A:2s / B:2p / C:2f | CONFIRMED |

Notation: p=passed, f=failed, s=skipped; A/B=controls, C=combined.

**Observation:** Scenarios 1 and 2 are only exposed by the generated behavioral test — the existing suites pass cleanly on merged code. Scenario 3 is self-revealing in the existing suite. This demonstrates that cross-boundary integration paths missing from existing tests are the primary value target for the generated-test workflow.

---

## Methodology and limitations

### What was measured

- Whether the `/collision` workflow reproduces the expected CONFIRMED verdict for all three prepared fixtures
- Independent branch suite pass/fail status before merging
- Whether existing merged tests detect the collision (vs. requiring a generated test)
- Correct classification of failures as semantic assertion failures vs. setup errors
- Helper execution durations (wall-clock, as recorded in execution.json)

### What was not measured

- **Bob analysis time:** Not instrumented. The workflow does not capture the time between `prepare` completing and `verify` being called. This duration includes Bob reading diffs, writing the hypothesis, and authoring the generated test. It is marked **unavailable** for all three scenarios.
- **Blind discovery accuracy:** All three fixtures are pre-seeded with explicit clues. No new unknown conflicts were analyzed.
- **Subagent parallelism:** No subagents were dispatched in this run. The collision workflow step 4 states: "If subagents are available, delegate one read-only branch analysis to each…in parallel. Otherwise perform these analyses sequentially and disclose that no subagents ran." Sequential analysis was performed; subagent execution is disclosed as not occurring.

### Helper timing breakdown

| Scenario | Helper verify total | Bob analysis time |
|---|---|---|
| 1 (existing run) | ~14,108 ms | unavailable |
| 2 (fresh run) | ~16,330 ms | unavailable |
| 3 (fresh run) | ~13,255 ms | unavailable |

Typical helper verify breakdown: ~3–4 s per suite (×3 suites = ~9–12 s), plus merge (~260 ms), plus 3 generated test runs (~1.4 s each = ~4.2 s), plus cleanup. Total helper wall-clock is dominated by Node.js test runner startup per invocation.

### Evidence paths

All evidence is under `scripts/reports/` (gitignored). The benchmark document (`docs/benchmark-results.md`) is committed; the raw execution evidence is not.

| Scenario | Evidence path |
|---|---|
| 1 | `scripts/reports/analysis-1790394975281/` |
| 2 | `scripts/reports/analysis-1790395659460/` |
| 2 (prior failed attempt) | `scripts/reports/analysis-1790395577528/` |
| 3 | `scripts/reports/analysis-1790395587341/` |

Files in each directory: `manifest.json`, `branch-A.diff`, `branch-B.diff`, `branch-A-files.txt`, `branch-B-files.txt`, `hypothesis.md`, `generated.test.mjs`, `execution.json`, `analysis.json`, `analysis.md`. Scenario 1 additionally has `requirements.md`.
