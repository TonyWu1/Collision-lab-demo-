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

## Why the workflow matters

CollisionLab focuses on composition failures that ordinary merge checks can miss. In the identity scenario, both branch suites pass and the merged existing suite remains **19/19 green**, while the generated integration test exposes the incompatible email-versus-username assumption. The helper verification run for that scenario completes in roughly **14 seconds** on the recorded benchmark.

The three prepared scenarios cover different classes of contract collision: identity semantics, API/data shape, and data lifecycle. The goal is not to replace Git or a full test suite, but to add a focused Bob-assisted verification step when independently valid changes may interact.

## Try the hosted demo

[Open CollisionLab’s evidence dashboard](https://tonywu1.github.io/Collision-lab-demo-/).

The hosted site presents a live browser playground plus saved demonstration evidence. It does not run IBM Bob or analyze a visitor’s branches live. The failing application tests shown in collision cards are intentional reproductions; they are evidence of the collision, not dashboard crashes.

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

The reusable Bob command is defined in [`.bob/commands/collision.md`](.bob/commands/collision.md). It instructs Bob to pin the branch refs, analyze the branches independently, form a falsifiable hypothesis, generate a fresh integration test, execute it in isolated worktrees, classify the result, and suggest a minimal fix without silently modifying production code.

The hosted dashboard is a saved-evidence viewer and browser playground; Bob runs in the developer’s IDE, not inside the public webpage.

### Bob task evidence

Genuine IBM Bob task-session evidence from the development of CollisionLab is available in [`bob_sessions/`](bob_sessions/).

The screenshots document Bob-assisted branch analysis, semantic-conflict reasoning, integration-test design, debugging, and verification performed during the project.

## Technology

- IBM Bob 2.0 Agent mode
- Node.js, plain JavaScript, and Git
- Node.js built-in test runner
- Git worktrees for isolated branch and merge verification
- Static HTML, CSS, and JavaScript playground/dashboard
- No database or third-party runtime dependencies

## Repository layout

```text
.
├── .bob/commands/      # Reusable IBM Bob /collision workflow
├── bob_sessions/       # Genuine IBM Bob task-session evidence
├── docs/               # Workflow documentation and benchmark results
├── public/             # Hosted playground and saved evidence
├── scripts/            # Evidence runner, verification helpers, and local dashboard
├── src/                # Baseline sample application
├── tests/              # Node.js tests
├── package.json
└── README.md
```

## Project status

This repository is a hackathon prototype and evidence package. It demonstrates how individually valid changes can interact badly, and it documents what the current runner can verify. The public demo and local runner have different roles: the public site is a live browser demonstration plus saved replay; the local runner executes the prepared Git scenarios and Bob workflow.
