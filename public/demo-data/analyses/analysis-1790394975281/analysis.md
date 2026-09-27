# Collision Analysis v3: feature/email-auth × feature/profile-cache-v2

**Verdict: CONFIRMED**
**Evidence directory:** `scripts/reports/analysis-1790394975281`
**Test sha256:** `a4d747a63883bc3601f3d52ddd32c8774395575aca40deb4aea980293bd4f17b`
**Previous evidence preserved:**
- `scripts/reports/analysis-1790394477074` (v1)
- `scripts/reports/analysis-1790394782422` (v2)

---

## Change from v2

The only modification to the test was replacing the early `return` path with `t.skip()` via the
`TestContext` parameter:

```js
// v2 — early return, runner counted as "passed"
if (sessionModuleAbsent) {
  console.log('[SKIP] ...');
  return;
}

// v3 — explicit skip, runner counts in "skipped" bucket
test('...', async (t) => {
  if (!profileSessionExists) {
    t.skip('profileSession.js is absent on this branch');
    return;
  }
  // ... assertions unchanged
});
```

No production code, user fixtures, credentials, or other assertions were changed.

---

## Results

### Independent branch suites

| Suite | Tests | Pass | Fail | Exit |
|---|---|---|---|---|
| Branch A existing | 12 | 12 | 0 | 0 |
| Branch B existing | 19 | 19 | 0 | 0 |
| Merged existing | 19 | 19 | 0 | 0 |

Existing suite passes on all three worktrees. Collision undetected by any pre-existing test.

### Generated test (v3)

| Worktree | Pass | Fail | Skipped | Exit | TAP signal |
|---|---|---|---|---|---|
| **Control A** | 1 | 0 | 1 | 0 | `ok 2 … # SKIP profileSession.js is absent on this branch` |
| **Control B** | 2 | 0 | 0 | 0 | Both tests `ok` |
| **Combined** | 1 | 1 | 0 | 1 | `ok 1` / `not ok 2` |

All three counts match the requested targets exactly.

---

## TAP evidence (from execution.json)

**Control A — skip directive:**
```
ok 2 - loginAndLoadProfile() returns the same user as login() for the same credential # SKIP profileSession.js is absent on this branch
# tests 2  # pass 1  # fail 0  # skipped 1
```

**Control B — both pass:**
```
ok 1 - login() accepts the probed credential and returns Alice
ok 2 - loginAndLoadProfile() returns the same user as login() for the same credential
# tests 2  # pass 2  # fail 0  # skipped 0
```

**Combined — login passes, integration fails:**
```
ok 1 - login() accepts the probed credential and returns Alice
not ok 2 - loginAndLoadProfile() returns the same user as login() for the same credential
  error: 'loginAndLoadProfile("alice@example.com") must return a user record, got: null.
          login() accepted this credential (test 1 passed), so null here means the profile
          lookup failed after a successful login — the collision.'
# tests 2  # pass 1  # fail 1  # skipped 0
```

The failure on combined occurs **after test 1 passes**, directly isolating the cache-key mismatch
as the fault site — not the authentication step.

---

## Verdict: CONFIRMED

All four conditions met:
1. Both original branch suites pass ✓
2. Merge is textually clean (ort, exit 0, zero unmerged paths) ✓
3. Generated test fails on merged code with a behavioral assertion after a successful login ✓
4. Control A skips (module absent), control B passes (integration works under username-auth) — failure is tied to composition ✓

Cleanup: all 3 worktrees removed, all exit 0. ✓

