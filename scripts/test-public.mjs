import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { runScenario } from '../public/playground/run.mjs';
async function validateJson(dir) {
 for (const file of await readdir(dir, {withFileTypes:true})) {
  const path = `${dir}/${file.name}`;
  if (file.isDirectory()) await validateJson(path);
  else if (file.name.endsWith('.json')) assert.doesNotThrow(()=>JSON.parse(fileContent.get(path)),path);
 }
}
const fileContent=new Map();
async function collect(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=`${dir}/${e.name}`;if(e.isDirectory())await collect(p);else if(p.endsWith('.json'))fileContent.set(p,await readFile(p,'utf8'));}}
test('all published evidence JSON parses',async()=>{await collect('public/demo-data');await validateJson('public/demo-data');});
test('all users authenticate, lose profile when combined, and recover with the ID fix',()=>{
 for(const userId of ['u1','u2','u3']) {
  const broken=runScenario('auth',{userId});assert.equal(broken.control,userId);assert.equal(broken.actual,null);assert.equal(broken.passed,false);
  const fixed=runScenario('auth',{userId,fixed:true});assert.equal(fixed.actual,userId);assert.equal(fixed.passed,true);
 }
});
test('cart runs real catalog prices and quantities including repeat runs',()=>{
 for(const [productId,price] of [['p1',20],['p2',45],['p3',8]]) for(const quantity of [1,2,50]){
  const r=runScenario('price',{productId,quantity});assert.equal(r.expected,price*quantity);assert.equal(r.control,r.expected);assert.ok(Number.isNaN(r.actual));assert.equal(r.passed,false);
 }
});
test('deletions reset on every run and counts follow input',()=>{
 for(const count of [1,3,2,1]) {const r=runScenario('delete',{count});assert.equal(r.control,3-count);assert.equal(r.actual,3);assert.equal(r.passed,false);}
});
test('invalid inputs cannot be labeled confirmed collisions',()=>{
 for(const quantity of [0,-1,1.5,51,NaN]) assert.throws(()=>runScenario('price',{quantity}));
 assert.throws(()=>runScenario('auth',{userId:'missing'}));assert.throws(()=>runScenario('delete',{count:0}));
});
