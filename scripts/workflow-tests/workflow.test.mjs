import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'collision-workflow-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'scripts')); mkdirSync(join(root, 'src')); mkdirSync(join(root, 'tests'));
  cpSync(new URL('../collision-workflow.mjs', import.meta.url), join(root, 'scripts/collision-workflow.mjs'));
  function cmd(exe, args) {
    const r = spawnSync(exe, args, { cwd: root, encoding: 'utf8', timeout: 30000 });
    assert.equal(r.error, undefined); return r;
  }
  function git(...args) { const r = cmd('git', args); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); }
  function write(path, text) { writeFileSync(join(root, path), text); }
  function commit() { git('add', '.'); git('commit', '-qm', 'fixture'); }
  git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.com');
  write('src/value.mjs', 'export const price = 20;\n');
  write('tests/base.test.mjs', "import {test} from 'node:test'; import assert from 'node:assert/strict'; test('base',()=>assert.equal(1,1));\n");
  commit(); const base = git('rev-parse', 'HEAD');
  git('switch', '-qc', 'price'); write('src/value.mjs', 'export const price = {amount:20};\n'); commit();
  git('switch', '-qc', 'consumer', base);
  write('src/consumer.mjs', 'export const total = price => price * 2;\n'); commit();
  const before = git('rev-parse', 'HEAD');
  function prepare(a='price', b='consumer') {
    const r = cmd(process.execPath, ['scripts/collision-workflow.mjs', 'prepare', a, b]);
    assert.equal(r.status, 0, r.stderr);
    const dir = join(root,'scripts/reports', readdirSync(join(root,'scripts/reports')).sort().at(-1));
    writeFileSync(join(dir,'hypothesis.md'), 'Object price cannot be multiplied by a numeric consumer.');
    return dir;
  }
  function verify(dir, source) {
    writeFileSync(join(dir,'generated.test.mjs'), source);
    const r = cmd(process.execPath, ['scripts/collision-workflow.mjs','verify',dir]);
    const report = JSON.parse(readFileSync(join(dir,'execution.json'),'utf8'));
    assert.equal(git('rev-parse','HEAD'),before);
    assert.equal(git('worktree','list','--porcelain').match(/^worktree /gm).length,1);
    assert.equal(report.cleanupOk,true);
    return {r,report};
  }
  return {root,git,write,commit,base,prepare,verify,cmd};
}
const prefix = "import {test} from 'node:test'; import assert from 'node:assert/strict';\n";
test('collects real composition failure without claiming confirmation; records unavailable control', t => {
  const f=fixture(t),dir=f.prepare();
  const {r,report}=f.verify(dir,prefix+"import {price} from '../src/value.mjs'; import {total} from '../src/consumer.mjs'; test('total',()=>assert.equal(total(price),40));");
  assert.equal(r.status,0); assert.equal(report.status,'FAILURE_REQUIRES_REVIEW');
  assert.equal(report.runs.branchA.exitCode,0); assert.equal(report.runs.branchB.exitCode,0);
  assert.equal(report.merge.exitCode,0); assert.equal(report.runs.controlB.exitCode,0);
  assert.equal(report.runs.controlA.exitCode,1); // absent module must remain visible
  assert.match(report.runs.combined.stdout,/ERR_ASSERTION/);
});
test('passing generated test is NOT_REPRODUCED', t => {
  const f=fixture(t),dir=f.prepare();
  const {r,report}=f.verify(dir,prefix+"test('unrelated passing observation',()=>assert.equal(1,1));");
  assert.equal(r.status,0); assert.equal(report.status,'NOT_REPRODUCED');
});
test('textual conflict stops execution without resolution', t => {
  const f=fixture(t);
  f.git('branch','conflict',f.base);
  // Commit through a temporary worktree so the original HEAD does not move.
  const tree=join(f.root,'other'); f.git('worktree','add',tree,'conflict');
  writeFileSync(join(tree,'src/value.mjs'),'export const price = 99;\n');
  f.git('-C',tree,'add','.'); f.git('-C',tree,'commit','-qm','conflict'); f.git('worktree','remove',tree);
  const dir=f.prepare('price','conflict');
  const {r,report}=f.verify(dir,prefix+"test('unused',()=>assert.ok(true));");
  assert.equal(r.status,1); assert.equal(report.status,'TEXTUAL_CONFLICT');
  assert.equal(report.runs.combined,undefined);
});
test('failing independent suite blocks collision verification', t => {
  const f=fixture(t); f.git('branch','bad','price');
  const tree=join(f.root,'other');f.git('worktree','add',tree,'bad');
  writeFileSync(join(tree,'tests/base.test.mjs'),prefix+"test('bad',()=>assert.fail('broken baseline'));");
  f.git('-C',tree,'add','.');f.git('-C',tree,'commit','-qm','bad');f.git('worktree','remove',tree);
  const dir=f.prepare('bad','consumer');
  const {r,report}=f.verify(dir,prefix+"test('unused',()=>assert.ok(true));");
  assert.equal(r.status,1);assert.equal(report.status,'BASELINE_FAILED');assert.equal(report.merge,undefined);
});
