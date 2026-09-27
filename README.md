# CollisionLab

> **Find the behavioral conflicts Git cannot see.**

CollisionLab demonstrates a common integration risk: two branches pass their own tests and merge without text conflicts, yet their combined behavior breaks an application.

[🌐 Open the demo](https://tonywu1.github.io/Collision-lab-demo-/) · [📦 View the repository](https://github.com/TonyWu1/Collision-lab-demo-)

## The problem

A clean Git merge only confirms that Git could combine the text. It does not confirm that the features agree on what data means or how the application should behave.

CollisionLab makes that gap visible with controlled examples. It checks the branches independently, merges them in an isolated worktree, and exercises the combined behavior with an integration test.

## Demonstrations

| Example | Branch assumptions | Combined result |
|---|---|---|
| **Email login and profile cache** | Authentication accepts email; the profile cache looks up by username | Login succeeds, but the profile lookup returns `null` |
| **Price object and cart total** | The catalog returns a price object; the cart expects a number | The total becomes `NaN` |
| **Soft delete and reporting** | Deleted users remain stored; reporting counts every stored user | The active-user count is too high |

Scenario 1 includes a fix that keys the profile cache by immutable user ID. Scenarios 2 and 3 are demonstrations; their fixes are not implemented yet.

## What the prototype does

- Runs known scenario branches independently.
- Checks whether Git can merge the selected scenario without textual conflicts.
- Runs a focused integration check against the combined behavior.
- Shows the result and supporting evidence in a browser dashboard.
- Uses Node.js and Git worktrees for the local evidence runner.

**Current scope:** this is a reproducible demo for three prepared scenarios. It is not yet a general service that accepts arbitrary repositories or discovers every possible semantic conflict.

## Try the hosted demo

[Open CollisionLab’s evidence dashboard](https://tonywu1.github.io/Collision-lab-demo-/).

The hosted site presents saved demonstration evidence. It does not run IBM Bob or analyze a visitor’s branches live. The failing application tests shown in collision cards are intentional reproductions; they are evidence of the collision, not dashboard crashes.

## Run locally

You need Node.js 20 or newer and Git.

```bash
git clone https://github.com/TonyWu1/Collision-lab-demo-.git
cd Collision-lab-demo-
npm test
npm run demo
npm run dashboard
```

There are no npm packages to install. The evidence runner uses the scenario branches in this repository; on a fresh clone, fetch the repository branches before running it:

```bash
git fetch origin '+refs/heads/*:refs/heads/*'
```

The dashboard runs at **http://localhost:7432/**. The runner uses temporary Git worktrees and writes its reports under `scripts/reports/`.

## IBM Bob 2.0 workflow

CollisionLab is designed around a Bob-assisted developer workflow:

1. Review the two branch changes and the project requirements.
2. Compare the identity or data assumptions each branch makes.
3. Propose a focused integration test for the suspected interaction.
4. Run the test against the combined code and inspect the result.
5. Explain the collision and suggest a compatible change.

The hosted dashboard is a saved-evidence viewer; Bob runs in the developer’s IDE, not inside the public webpage.

### Bob task evidence

The hackathon submission requires task-session summary screenshots captured in the hackathon-provisioned Bob account. Add the genuine screenshots to [`bob_sessions/`](bob_sessions/README.md) before submission. The folder currently contains instructions only; it does not claim that screenshots have already been added.

## Technology

- Node.js, plain JavaScript, and Git
- Node.js built-in test runner
- Static HTML, CSS, and JavaScript dashboard
- No database or third-party runtime dependencies

## Repository layout

```text
.
├── bob_sessions/       # Add genuine IBM Bob task-summary screenshots here
├── scripts/            # Evidence runner, local dashboard, and checks
├── src/                # Baseline sample application
├── tests/              # Node.js tests
├── package.json
└── README.md
```

## Project status

This repository is a hackathon prototype and evidence package. It demonstrates how individually valid changes can interact badly, and it documents what the current runner can verify. The public demo and local runner have different roles: the public site is a saved replay; the local runner executes the prepared Git scenarios.
