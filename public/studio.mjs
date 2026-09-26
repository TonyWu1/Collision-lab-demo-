import { runScenario, displayValue } from './playground/run.mjs';
const $ = id => document.getElementById(id);
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const scenarios = {
 auth: {tag:'IDENTITY', title:'A login succeeds. The profile disappears.', description:'Email becomes the login credential. The profile cache still expects a username. Watch the same user cross that boundary.', a:'Email authentication', b:'Username profile cache', changeA:'login(email) resolves the user.', changeB:'The raw credential becomes the lookup key.', directory:'analysis-1790394975281', explanation:'Authentication accepts the email, but the profile is stored under a username. Reusing the email as the cache key returns null.', fields:'<label for="userId">Sample user</label><select id="userId"><option value="u1">Alice Chen · alice@example.com</option><option value="u2">Bruno Garcia · bruno@example.com</option><option value="u3">Carla Smith · carla@example.com</option></select><label class="fix-toggle"><input id="fixed" type="checkbox"> Compare with the existing ID-based fix</label>'},
 price: {tag:'API CONTRACT', title:'A richer price. An impossible total.', description:'The catalog introduces currency-aware prices. Cart calculations keep treating the price as a number.', a:'Structured product prices', b:'Numeric cart calculation', changeA:'price becomes { amount, currency }.', changeB:'The cart multiplies price × quantity.', directory:'analysis-1790395659460', explanation:'The catalog returns a price object. Multiplying that object by a quantity produces NaN, so the cart cannot return a valid total.', fields:'<div class="input-row"><div><label for="productId">Product</label><select id="productId"><option value="p1">Widget · $20</option><option value="p2">Gadget · $45</option><option value="p3">Doohick · $8</option></select></div><div><label for="quantity">Quantity</label><input id="quantity" type="number" min="1" max="50" step="1" value="2" required></div></div><p class="input-note">Try changing the quantity. Both versions use the same product.</p>'},
 delete: {tag:'DATA LIFECYCLE', title:'The user is gone. The count isn’t.', description:'Deletion keeps records for recovery. Reporting still assumes every stored record belongs to an active user.', a:'Soft deletion', b:'Active-user reporting', changeA:'removeUser() sets deleted: true.', changeB:'The report counts all stored records.', directory:'analysis-1790395587341', explanation:'Soft deletion keeps the records in storage. Counting all records includes deleted users; an active-user report must exclude them.', fields:'<label for="count">Users to remove from the 3-user sample</label><select id="count"><option value="1">Remove 1 user</option><option value="2">Remove 2 users</option><option value="3">Remove all 3 users</option></select><p class="input-note">The user store resets before every run.</p>'}
};
let selected = 'auth', evidenceRequest = 0;
const emptyConsole = $('console').innerHTML;
async function loadEvidence(key) {
 const token = ++evidenceRequest;
 $('recordSummary').textContent = 'Loading recorded branch and merge results…'; $('archiveNote').textContent = '';
 $('recordLink').href = `evidence.html?analysis=${scenarios[key].directory}`;
 try {
  const response = await fetch(`demo-data/analyses/${scenarios[key].directory}/execution.json`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (token !== evidenceRequest) return;
  const a = data.runs?.branchA, b = data.runs?.branchB;
  if (!a?.summary || !b?.summary || !data.merge) throw new Error('Incomplete evidence structure');
  const clean = data.merge.exitCode === 0 && !data.unmergedPaths?.length;
  $('recordSummary').textContent = `Saved run: A ${a.summary.passed} passed / ${a.summary.failed} failed · B ${b.summary.passed} passed / ${b.summary.failed} failed · ${clean ? 'Git merged cleanly' : 'Merge needs review'}.`;
  if (data.exportNotes) $('archiveNote').textContent = 'Archive note: some exported log text was damaged during redaction and is unavailable. Original structured results are preserved; this browser run is independent.';
 } catch (error) {
  if (token !== evidenceRequest) return;
  $('recordSummary').textContent = `Saved evidence unavailable (${error.message}). You can still run the browser example.`;
 }
}
function choose(key) {
 selected = key; const s = scenarios[key];
 document.querySelectorAll('[data-scenario]').forEach(b => { const active = b.dataset.scenario === key; b.classList.toggle('selected', active); b.setAttribute('aria-selected', String(active)); });
 $('scenarioTag').textContent=s.tag; $('scenarioTitle').textContent=s.title; $('scenarioDescription').textContent=s.description;
 for (const [id,value] of Object.entries({branchA:s.a,branchB:s.b,changeA:s.changeA,changeB:s.changeB})) $(id).textContent=value;
 $('inputs').innerHTML=s.fields; $('console').innerHTML=emptyConsole; $('result').innerHTML=''; $('runStatus').textContent='READY';
 $('sourceLink').href='playground/sources.json'; loadEvidence(key);
}
document.querySelectorAll('[data-scenario]').forEach(button => {
 button.addEventListener('click', () => choose(button.dataset.scenario));
 button.addEventListener('keydown', event => {
  if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
  event.preventDefault(); const buttons=[...document.querySelectorAll('[data-scenario]')];
  let index=buttons.indexOf(button); index=event.key==='Home'?0:event.key==='End'?2:(index+(event.key==='ArrowRight'?1:2))%3;
  buttons[index].focus(); choose(buttons[index].dataset.scenario);
 });
});
$('runForm').addEventListener('submit', event => {
 event.preventDefault(); const options = { userId:$('userId')?.value, fixed:$('fixed')?.checked, productId:$('productId')?.value, quantity:$('quantity')?.value, count:$('count')?.value };
 try {
  const run = runScenario(selected, options), reproduced = run.controlPassed && !run.passed;
  const title = !run.controlPassed ? 'Control failed — review required' : run.passed ? 'Profile compatibility restored' : 'Collision reproduced';
  $('runStatus').textContent = run.passed ? 'ASSERTION PASSED' : 'ASSERTION FAILED';
  $('console').innerHTML = `<div class="trace"><div class="trace-title">$ run ${escape(selected)} ${options.fixed ? '--with-fix' : '--combined'}</div>${run.trace.map((line,i)=>`<div class="trace-line"><span>0${i+1}</span>${escape(line)}</div>`).join('')}<div class="console-verdict ${run.passed?'good':''}">${run.passed?'✓':'×'} assert actual === expected<br>actual: ${escape(displayValue(run.actual))} · expected: ${escape(displayValue(run.expected))}</div><div class="console-time">Executed now · ${run.durationMs.toFixed(2)} ms · ${new Date(run.ranAt).toLocaleTimeString()}</div></div>`;
  $('sourceLink').href=`playground/${run.source}`;
  $('result').innerHTML=`<div class="result-panel ${run.passed?'good':''}"><div><h3>${escape(title)}</h3><p>${!run.controlPassed?'The control did not satisfy the assertion. This run cannot confirm a collision.':run.passed?'The existing fix stores and retrieves the profile by immutable user ID. Email remains the login credential.':escape(scenarios[selected].explanation)} ${reproduced?'This is an expected failure in the sample application. The playground is working.':''}</p></div><div class="comparison"><div><small>WORKING CONTROL</small><strong class="${run.controlPassed?'good':'bad'}">${escape(displayValue(run.control))}</strong></div><div><small>EXPECTED RESULT</small><strong>${escape(displayValue(run.expected))}</strong></div><div><small>${options.fixed?'WITH FIX':'COMBINED RESULT'}</small><strong class="${run.passed?'good':'bad'}">${escape(displayValue(run.actual))}</strong></div></div></div>`;
 } catch (error) { $('runStatus').textContent='INPUT / EXECUTION ERROR'; $('result').innerHTML=`<p class="error">${escape(error.message)}</p>`; }
});
$('inputs').addEventListener('change', () => { $('result').innerHTML=''; $('console').innerHTML=emptyConsole; $('runStatus').textContent='READY · INPUT CHANGED'; });
$('inputs').addEventListener('input', () => { $('result').innerHTML=''; $('console').innerHTML=emptyConsole; $('runStatus').textContent='READY · INPUT CHANGED'; });
$('copyCommand').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('bobCommand').textContent); $('copyCommand').textContent='Copied'; } catch { $('copyCommand').textContent='Select the command to copy'; } });
choose(selected);
