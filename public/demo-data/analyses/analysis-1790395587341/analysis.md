# Analysis: feature/soft-delete × feature/reporting

**Analysis directory:** `scripts/reports/analysis-1790395587341`  
**Phase:** 13  
**Verdict:** CONFIRMED  
**Created:** 2026-09-26T04:10:00Z

---

## Branches

| | Ref | SHA |
|---|---|---|
| A | `feature/soft-delete` | `5e3c257` |
| B | `feature/reporting` | `dbbbbfd` |
| merge-base | | `2333e05` |

No requirements file supplied.

---

## Fixture disclosure

The collision is explicitly pre-announced in source comments:
- `src/reporting.js` comment: "Assumes that removeUser physically removes the record from the store"
- `tests/reporting.test.js` comment: "On main, removeUser physically splices — so count should drop to 2"

This run measures **known-fixture repeatability**, not blind discovery accuracy.

---

## Hypothesis

`feature/soft-delete` changes `removeUser(id)` from physically splicing the record out of the array to setting `user.deleted = true`. `getAllUsers()` continues to return all records including deleted ones.

`feature/reporting` introduces `getActiveUserCount()` and `getUserSummary()` backed by `getAllUsers()`, with the explicit assumption that physical deletion is in effect. After merging, `getActiveUserCount()` returns 3 after a user is "removed" (the record is still present with `deleted: true`), breaking reporting correctness.

**Incompatible assumption:** reporting assumes `getAllUsers()` returns only active users; soft-delete changes it to return all users.

---

## Test results

### Independent suites

| Suite | Tests | Passed | Failed | Skipped |
|---|---|---|---|---|
| Branch A (soft-delete) existing | 17 | 17 | 0 | 0 |
| Branch B (reporting) existing | 16 | 16 | 0 | 0 |

Both branch suites pass independently. ✓

### Merge

Clean textual merge (ort strategy). Files changed: `src/userStore.js`, `tests/userStore.test.js`. No unmerged paths.

### Merged existing suite

| Tests | Passed | Failed | Skipped |
|---|---|---|---|
| 21 | 19 | **2** | 0 |

⚠️ **Collision detected by existing merged tests.** Two tests in `tests/reporting.test.js` fail immediately on merge:

1. `getActiveUserCount decrements after a user is removed` — expected `2`, got `3`
2. `getUserSummary excludes removed users` — expected `2` usernames excluding bruno, got `3` including bruno

These are **semantic assertion failures** — the actual values returned are wrong, not import or setup errors.

### Generated test controls

| Run | Tests | Passed | Failed | Skipped | Notes |
|---|---|---|---|---|---|
| Control A (soft-delete) | 2 | 0 | 0 | 2 | `reporting.js` absent → both skipped |
| Control B (reporting) | 2 | 2 | 0 | 0 | Physical delete keeps counts correct |
| Combined | 2 | 0 | 2 | 0 | Soft-delete leaks — collision triggered |

**Control pattern:** `A: 0/2/0 | B: 2/0/0 | combined: 0/2/0` (pass/skip/fail). Matches expected.

### Combined failure detail

```
error: 'getActiveUserCount() must return 2 after one of three users is removed; got: 3.
       If count is 3, removeUser() did not physically remove the record — soft-delete collision.
       3 !== 2'
code: ERR_ASSERTION  operator: strictEqual  expected: 2  actual: 3
```

This is a **semantic assertion failure**, not a setup error.

---

## Verdict: CONFIRMED

Both branch suites pass independently. Merge is textually clean. The existing merged suite **independently detects** the collision (2 failures in reporting.test.js). The generated test provides additional controlled evidence: control B passes (physical delete is compatible with reporting), combined fails (soft-delete is not) — confirming composition as the fault site.

---

## Suggested fix (not applied)

Change `getActiveUserCount()` to filter deleted records:

```js
export function getActiveUserCount() {
  return getAllUsers().filter(u => !u.deleted).length;
}
```

Similarly for `getUserSummary()`. Or add a `getActiveUsers()` helper to `userStore.js` that filters on `!u.deleted` and have reporting.js call that instead.

