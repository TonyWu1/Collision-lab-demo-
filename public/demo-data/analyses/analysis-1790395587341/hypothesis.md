# Hypothesis: feature/soft-delete × feature/reporting

## Branch behaviours (independent)

**feature/soft-delete** (`src/userStore.js`)  
Changes `removeUser(id)` from physically splicing the record out of the array to setting `user.deleted = true`.  
`getAllUsers()` returns `users.slice()` — all records including soft-deleted ones.  
The branch comment reads: "Downstream code that needs 'active users' should filter on `!u.deleted`."  
The branch adds `tests/userStore.test.js` which explicitly asserts: "removeUser does not change total count in getAllUsers" and "getAllUsers returns all records including soft-deleted ones."

**feature/reporting** (`src/reporting.js`)  
Introduces `getActiveUserCount()` and `getUserSummary()`, both backed by `getAllUsers()`.  
The module comment reads: "Assumes that removeUser physically removes the record from the store, so getAllUsers() always returns only active (non-deleted) users."  
After `removeUser('u1')`, it expects `getActiveUserCount()` to return `2`.  
The branch's own test (`tests/reporting.test.js`) asserts `getActiveUserCount()` decrements after a user is removed, and `getUserSummary()` excludes removed users.

## Expected combined behaviour

On the merged codebase:
- `removeUser('u1')` sets `deleted: true` on alice's record (soft-delete semantics from feature/soft-delete)
- `getAllUsers()` returns all 3 records including alice's soft-deleted record
- `getActiveUserCount()` returns `getAllUsers().length` → `3` (not `2`)
- `getUserSummary().total` → `3`; `getUserSummary().usernames` includes `'alice'`

The existing `tests/reporting.test.js` (which asserts the count drops to 2 after removal and that alice is excluded) **will fail on merged code**.

## Specific incompatible assumption

`feature/reporting` assumes `getAllUsers()` returns only **active** users — i.e., that physical deletion is in effect.  
`feature/soft-delete` changes `getAllUsers()` to return **all** users (active + deleted), requiring callers to filter on `!u.deleted`.  
These are mutually exclusive caller contracts: reporting's aggregation functions produce wrong counts without filtering.

This is a **composition incompatibility** — neither branch is defective alone; the fault appears when reporting functions consume the soft-delete store after merging.

**Fixture disclosure**: The existing comment in `src/reporting.js` ("Assumes that removeUser physically removes the record") and the assertion in `tests/reporting.test.js` ("On main, removeUser physically splices — so count should drop to 2") explicitly reveal the intended collision. This is a prepared fixture, not a blindly discovered conflict.

## Source citations

- `feature/soft-delete` @ `5e3c257`: `src/userStore.js` line 1 — "soft delete (sets deleted: true instead of removing the record)"
- `feature/soft-delete` @ `5e3c257`: `src/userStore.js` line 16 — `getAllUsers()` returns `users.slice()` (all records)
- `feature/reporting` @ `dbbbbfd`: `src/reporting.js` line 3 — "Assumes that removeUser physically removes the record"
- `feature/reporting` @ `dbbbbfd`: `src/reporting.js` lines 8–9 — `getActiveUserCount()` returns `getAllUsers().length`
- `feature/reporting` @ `dbbbbfd`: `tests/reporting.test.js` lines 22–24 — asserts count drops to 2

## Observable assertion that could disprove the hypothesis

Call `removeUser('u1')` then `getActiveUserCount()`. Assert the result is `2`.  
On the merged codebase the result will be `3` (soft-delete semantics retained the record).  
If `getActiveUserCount()` returns `2`, the hypothesis is disproved.

