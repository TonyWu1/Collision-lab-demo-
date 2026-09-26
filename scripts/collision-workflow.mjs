#!/usr/bin/env node
// Evidence collection only. Bob supplies the hypothesis, test and interpretation.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [mode, ...args] = process.argv.slice(2);
function run(command, argv, cwd = root) {
  const started = Date.now();
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT; // Nested Node test runners must emit their own TAP.
  const r = spawnSync(command, argv, { cwd, env, encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
  return { command, args: argv, cwd, exitCode: r.status, signal: r.signal, error: r.error?.message ?? null,
    stdout: r.stdout ?? '', stderr: r.stderr ?? '', durationMs: Date.now() - started };
}
function good(r) { return r.exitCode === 0 && !r.signal && !r.error; }
function git(...argv) {
  const r = run('git', argv);
  if (!good(r)) throw new Error(r.stderr || r.error || 'Git failed');
  return r.stdout.trim();
}
function pin(ref) {
  if (!ref || ref.startsWith('-')) throw new Error('Expected a branch or commit');
  for (const candidate of [ref, `origin/${ref}`]) {
    const r = run('git', ['rev-parse', '--verify', '--end-of-options', `${candidate}^{commit}`]);
    if (good(r)) return r.stdout.trim();
  }
  throw new Error(`Ref unavailable: ${ref}. Fetch or push the branch first.`);
}
function save(dir, name, value) { writeFileSync(join(dir, name), JSON.stringify(value, null, 2) + '\n'); }
function tests(dir, file) {
  const r = run(process.execPath, ['--test', '--test-reporter=tap', ...(file ? [file] : [])], dir);
  const count = r.stdout.match(/^# tests (\d+)\s*$/m);
  const failed = r.stdout.match(/^# fail (\d+)\s*$/m);
  const passed = r.stdout.match(/^# pass (\d+)\s*$/m);
  const skipped = r.stdout.match(/^# skipped (\d+)\s*$/m);
  // Raw TAP remains authoritative; these summaries never establish a semantic collision.
  return { ...r, summary: count && failed && passed ? { tests: +count[1], passed: +passed[1], failed: +failed[1], skipped: skipped ? +skipped[1] : null } : null };
}
function passing(r) { return good(r) && r.summary?.passed > 0 && r.summary.failed === 0; }
function digest(text) { return createHash('sha256').update(text).digest('hex'); }
try {
  if (mode === 'prepare') {
    if (args.length < 2 || args.length > 3) throw new Error('prepare <branchA> <branchB> [requirements-ref:path]');
    const a = pin(args[0]), b = pin(args[1]);
    const base = git('merge-base', a, b);
    const dir = join(root, 'scripts', 'reports', `analysis-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const manifest = { schemaVersion: 1, kind: 'bob-collision-workflow', createdAt: new Date().toISOString(),
      repoRoot: root, branchA: { ref: args[0], sha: a }, branchB: { ref: args[1], sha: b }, mergeBase: base };
    for (const [label, sha] of [['A', a], ['B', b]]) {
      writeFileSync(join(dir, `branch-${label}.diff`), git('diff', '--no-ext-diff', '--no-textconv', base, sha, '--') + '\n');
      writeFileSync(join(dir, `branch-${label}-files.txt`), git('ls-tree', '-r', '--name-only', sha) + '\n');
    }
    if (args[2]) {
      const split = args[2].indexOf(':');
      if (split < 1) throw new Error('Requirements must use ref:path syntax');
      const sha = pin(args[2].slice(0, split)), path = args[2].slice(split + 1);
      const content = git('show', `${sha}:${path}`) + '\n';
      writeFileSync(join(dir, 'requirements.md'), content);
      manifest.requirements = { sha, path, sha256: digest(content) };
    }
    save(dir, 'manifest.json', manifest);
    console.log(`Prepared: ${dir}\nRead the diffs and pinned source with git show. Save hypothesis.md and generated.test.mjs here before verify.`);
  } else if (mode === 'verify') {
    if (args.length !== 1) throw new Error('verify <analysis-directory>');
    const dir = resolve(args[0]), m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
    if (m.repoRoot !== root) throw new Error('Manifest belongs to a different checkout; prepare again here');
    const source = readFileSync(join(dir, 'generated.test.mjs'), 'utf8');
    const hypothesis = readFileSync(join(dir, 'hypothesis.md'), 'utf8');
    if (!source.trim() || !hypothesis.trim()) throw new Error('Test and hypothesis must not be empty');
    if (existsSync(join(dir, 'execution.json'))) throw new Error('Evidence already exists; prepare a new run to retry');
    const report = { schemaVersion: 1, kind: 'bob-collision-execution', startedAt: new Date().toISOString(),
      manifest: m, testSha256: digest(source), hypothesisSha256: digest(hypothesis),
      status: 'ERROR', runs: {}, cleanup: [] };
    const worktrees = [];
    function add(sha) {
      const parent = mkdtempSync(join(tmpdir(), 'collisionlab-analysis-'));
      const path = join(parent, 'tree');
      const entry = { parent, path, added: false }; worktrees.push(entry);
      const r = run('git', ['worktree', 'add', '--detach', path, pin(sha)]);
      if (!good(r)) throw new Error(r.stderr);
      entry.added = true;
      return path;
    }
    try {
      const a = add(m.branchA.sha), b = add(m.branchB.sha), combined = add(m.branchB.sha);
      report.runs.branchA = tests(a); report.runs.branchB = tests(b);
      if (!passing(report.runs.branchA) || !passing(report.runs.branchB)) {
        report.status = 'BASELINE_FAILED';
      } else {
        report.merge = run('git', ['-c', 'user.name=CollisionLab', '-c', 'user.email=demo@collisionlab.local',
          'merge', '--no-edit', m.branchA.sha], combined);
        report.unmergedPaths = run('git', ['diff', '--name-only', '--diff-filter=U'], combined);
        if (!good(report.merge)) {
          report.status = report.unmergedPaths.stdout.trim() ? 'TEXTUAL_CONFLICT' : 'MERGE_ERROR';
        } else {
          report.runs.mergedExisting = tests(combined);
          for (const [label, tree] of [['controlA', a], ['controlB', b], ['combined', combined]]) {
            mkdirSync(join(tree, 'tests'), { recursive: true });
            const file = join(tree, 'tests', 'collisionlab-generated.test.mjs');
            if (existsSync(file)) throw new Error('Generated test path already exists');
            writeFileSync(file, source);
            report.runs[label] = tests(tree, 'tests/collisionlab-generated.test.mjs');
          }
          const r = report.runs.combined;
          report.status = passing(r) ? 'NOT_REPRODUCED' :
            r.exitCode === 1 && !r.signal && !r.error && r.summary?.failed > 0
              ? 'FAILURE_REQUIRES_REVIEW' : 'EXECUTION_ERROR';
          // Failure alone is not proof: Bob must inspect assertions and branch controls.
        }
      }
    } catch (error) { report.status = 'ERROR'; report.error = error.message; }
    finally {
      for (const entry of worktrees.reverse()) {
        const removal = entry.added ? run('git', ['worktree', 'remove', '--force', entry.path]) : null;
        report.cleanup.push({ path: entry.path, result: removal });
        if (!removal || good(removal)) rmSync(entry.parent, { recursive: true, force: true });
      }
      report.cleanupOk = report.cleanup.every(c => c.result === null || good(c.result));
      if (!report.cleanupOk) report.status = 'CLEANUP_ERROR';
      report.finishedAt = new Date().toISOString();
      save(dir, 'execution.json', report);
    }
    console.log(`${report.status}\nEvidence: ${join(dir, 'execution.json')}`);
    process.exitCode = ['FAILURE_REQUIRES_REVIEW', 'NOT_REPRODUCED'].includes(report.status) ? 0 : 1;
  } else {
    throw new Error('Usage: node scripts/collision-workflow.mjs prepare <A> <B> [ref:path] | verify <analysis-directory>');
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
