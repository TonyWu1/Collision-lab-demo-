# Phase 11: reusable Bob collision workflow

Open the repository root in IBM Bob, select Agent mode, and invoke:

```text
/collision feature/email-auth feature/profile-cache-v2 demo/combined-auth-cache:requirements/authentication-v2.md
```

The command lives in `.bob/commands/collision.md`. IBM documents project command discovery and positional arguments at https://bob.ibm.com/docs/ide/features/slash-commands. If it does not appear in the slash menu, verify that Bob opened the repository root, then open the command file and ask Bob to follow it with the same arguments. Command execution inside Bob still needs a real Bob session; a Node smoke test cannot certify that integration.

## Responsibilities

Bob reads source and requirements, compares assumptions, writes a hypothesis and a fresh behavioral test, interprets execution evidence, and suggests a fix. The dependency-free Node helper pins commits, saves diffs, creates detached worktrees, executes tests and merges, and records raw results. It makes no model calls and does not discover conflicts itself.

```sh
node scripts/collision-workflow.mjs prepare feature/email-auth feature/profile-cache-v2 demo/combined-auth-cache:requirements/authentication-v2.md
# Bob reads the printed directory and writes hypothesis.md and generated.test.mjs there.
node scripts/collision-workflow.mjs verify scripts/reports/analysis-<timestamp>
```

Local refs are preferred; remote-tracking refs are used when a local ref is absent. Prepare again to test updated refs. Requirements use explicit `ref:path`, making cross-branch documents available without checking them out. A fresh clone must have the requested remote branches fetched. No dependency installation is performed: this helper targets the existing dependency-free Node project.

## Evidence and verdicts

Each run writes under ignored `scripts/reports/analysis-*`: manifest.json, diffs, file inventories, optional requirements.md, Bob's hypothesis.md, generated.test.mjs, execution.json, and Bob's analysis.json/analysis.md. Preserve these files when collecting benchmark or submission evidence; they are not committed automatically. execution.json is raw helper evidence; analysis.json is Bob's interpretation, which must cite that evidence. Do not replace one with the other.

Independent suites run before merging. The merged existing suite is recorded separately from the generated test. Identical generated test bytes run on A, B and the merged code. An absent feature can make a control inapplicable; an import error is not a behavioral regression. Bob must document this and obtain meaningful alternative controls or mark the finding inconclusive.

The helper deliberately emits FAILURE_REQUIRES_REVIEW for a failing generated test. It does not turn arbitrary test failures into confirmed collisions. NOT_REPRODUCED describes only the generated test, not universal compatibility. Exit 0 means collection completed with one of those two outcomes; baseline, merge, process and cleanup errors exit 1. Git worktrees do not sandbox executed code. Run only on trusted local projects. Each subprocess has a two-minute timeout. Ordinary completion/errors clean up per-run worktrees; abrupt termination may leave worktrees, which can be inspected with `git worktree list` and removed individually after checking their paths.

## Relationship to existing work

This is additive: no legacy runner, dashboard, application, feature branch or failing demonstration is replaced. It can be cherry-picked onto fix/runner-scenarios even when built from ui/evidence-dashboard. Existing scenario fixtures contain clues and have already been analyzed; rerunning Bob on them measures repeatability, not blind discovery accuracy.

Phase 11 acceptance: invoke /collision in Bob, retain its actual analysis and generated test, and inspect the resulting evidence. Subagent execution is reported only when actually available and used. Benchmarking Bob across all scenarios belongs to Phase 13. Connecting fresh reports to dashboard branch selectors belongs to Phase 14; the legacy dashboard currently does not consume these analysis directories.
