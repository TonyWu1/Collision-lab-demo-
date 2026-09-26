# CollisionLab — Public Demo

> **Saved demonstration evidence — analysis runs locally in IBM Bob.**

`public/` contains a static HTML dashboard that displays pre-recorded evidence from three semantic collision analyses. No Node.js, Git, or local API is required to view it.

---

## What's included

| Path | Description |
|---|---|
| `public/index.html` | Static dashboard (self-contained HTML+JS) |
| `public/demo-data/index.json` | Bundle manifest listing analyses and the prepared-demo report |
| `public/demo-data/prepared-demo.json` | Evidence from `npm run demo` (three scenarios, one run) |
| `public/demo-data/analyses/analysis-1790394975281/` | Auth identity / profile-cache collision — `feature/email-auth` × `feature/profile-cache-v2` |
| `public/demo-data/analyses/analysis-1790395587341/` | Soft-delete / reporting collision — `feature/soft-delete` × `feature/reporting` |
| `public/demo-data/analyses/analysis-1790395659460/` | Price object / cart collision — `feature/price-object-v2` × `feature/cart` |

All three analyses were produced by running `/collision` in IBM Bob Agent mode on this repository. All absolute paths have been redacted from the evidence files.

---

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

---

## Publish to GitHub Pages

### Option 1 — `docs/` folder on the branch

1. Copy the `public/` directory contents to `docs/` (or rename `public/` to `docs/`):
   ```bash
   cp -r public/* docs/public-demo/
   # or move the directory if using docs/ as root
   ```
2. In your GitHub repository settings → **Pages** → Source: **Deploy from a branch** → select `feature/public-demo` → folder `/docs`.
3. Push the branch. Pages deploys automatically.

### Option 2 — `gh-pages` branch

```bash
# From the repo root on feature/public-demo:
git subtree push --prefix public origin gh-pages
```

Or using the `gh-pages` npm package:
```bash
npx gh-pages -d public
```

GitHub Pages will serve `public/index.html` as the root.

### Option 3 — GitHub Actions (recommended for automation)

Create `.github/workflows/pages.yml`:

```yaml
name: Deploy CollisionLab Public Demo
on:
  push:
    branches: [feature/public-demo]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v4
      - uses: actions/upload-pages-artifact@v3
        with:
          path: public
      - uses: actions/deploy-pages@v4
        id: deployment
```

Then in repository settings → Pages → Source: **GitHub Actions**.

> **Note:** Do not claim deployment until a public URL is actually reachable. The URL will be `https://<owner>.github.io/<repo>/` (or a custom domain if configured).

---

## Local development dashboard (preserved)

The full local dashboard with live analysis runner is unchanged:

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

---

## Evidence integrity

Each analysis directory contains:

- `manifest.json` — branch refs and SHAs recorded at workflow start
- `execution.json` — test run results, merge outcome, cleanup status
- `analysis.json` — Bob's verdict, rationale, and requirement violations
- `generated.test.mjs` — the independently generated collision test
- `hypothesis.md` — Bob's hypothesis before running tests

The static dashboard cross-checks `analysis.json` verdict against `manifest.json` SHAs and `execution.json` status. If they disagree, it shows **Evidence mismatch** rather than confirming the verdict.
