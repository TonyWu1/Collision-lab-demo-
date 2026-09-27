# Public live playground

The homepage executes the three prepared scenario functions in the visitor’s browser. It supports sample-user selection, product/quantity inputs, deletion count, and the existing identity fix. Every run resets its state. This is live JavaScript execution; it does not merge Git branches, run the Node test runner, or invoke IBM Bob.

Source snapshots are unchanged copies from the commits listed in `playground/sources.json`. The price snapshot comes from the available original `feature/price-object`; saved conflict-free Git merge evidence separately references `feature/price-object-v2`. Do not describe the browser run as proof of a new Git merge.

The saved evidence dashboard is available at `evidence.html`. Two execution files contained invalid diagnostic strings caused by an earlier public export. Only those damaged log strings were replaced with explicit unavailable notices. Structured results were retained unchanged. `exportNotes` records the omissions; these historical runs were not rerun.

Validation: `node --test scripts/test-public.mjs`. GitHub Pages runs this check before deployment so malformed evidence cannot be published silently. Preview: `node public/serve-test.mjs`, then open http://127.0.0.1:7433/.

---

# CollisionLab — Public Demo

> **Live browser playground + saved demonstration evidence. IBM Bob analysis runs in the developer IDE.**

`public/` contains the hosted CollisionLab experience. Visitors can execute three prepared browser scenarios and inspect pre-recorded evidence from Bob-assisted semantic-collision analyses. No Node.js, Git, or local API is required to view the hosted site.

## What's included

| Path | Description |
|---|---|
| `public/index.html` | Live browser playground for the three prepared scenarios |
| `public/evidence.html` | Saved evidence dashboard |
| `public/demo-data/index.json` | Bundle manifest listing analyses and the prepared-demo report |
| `public/demo-data/prepared-demo.json` | Evidence from `npm run demo` (three scenarios, one run) |
| `public/demo-data/analyses/analysis-1790394975281/` | Auth identity / profile-cache collision — `feature/email-auth` × `feature/profile-cache-v2` |
| `public/demo-data/analyses/analysis-1790395587341/` | Soft-delete / reporting collision — `feature/soft-delete` × `feature/reporting` |
| `public/demo-data/analyses/analysis-1790395659460/` | Price object / cart collision — `feature/price-object-v2` × `feature/cart` |

All three saved analyses were produced by running `/collision` in IBM Bob Agent mode on this repository. All absolute paths have been redacted from the evidence files.

## View locally

```bash
# Option A — Python (no dependencies)
cd public
python -m http.server 7433
# Then open http://localhost:7433/

# Option B — Node.js
cd public
node serve-test.mjs
# Then open http://127.0.0.1:7433/
```

## Publish to GitHub Pages

`main` is the canonical submission branch. The deployment workflow runs from `feature/public-demo`, which is kept synchronized with `main` for GitHub Pages deployment.

The workflow validates the public evidence and browser scenarios before publishing the `public/` directory. In repository settings → **Pages**, the source should be **GitHub Actions**.

The public URL is:

`https://tonywu1.github.io/Collision-lab-demo-/`

## Local development dashboard

```bash
# Start local dashboard (requires Node ≥ 20)
npm run dashboard
# Open http://localhost:7432/

# Re-run the prepared demo evidence runner
npm run demo

# Run a new /collision analysis:
# Open this repository in IBM Bob Agent mode and run:
#   /collision feature/email-auth feature/profile-cache-v2 demo/combined-auth-cache:requirements/authentication-v2.md
```

## Evidence integrity

Each saved analysis directory contains:

- `manifest.json` — branch refs and SHAs recorded at workflow start
- `execution.json` — test run results, merge outcome, cleanup status
- `analysis.json` — Bob's verdict, rationale, and requirement violations
- `generated.test.mjs` — the independently generated collision test
- `hypothesis.md` — Bob's hypothesis before running tests

The static dashboard cross-checks `analysis.json` verdict against `manifest.json` SHAs and `execution.json` status. If they disagree, it shows **Evidence mismatch** rather than confirming the verdict.
