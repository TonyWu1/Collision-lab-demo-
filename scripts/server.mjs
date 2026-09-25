#!/usr/bin/env node
/**
 * CollisionLab Evidence Dashboard — server
 *
 * Serves the single-page dashboard at http://localhost:7432/
 * Provides three API endpoints:
 *
 *   GET  /api/reports          → JSON array of {filename, timestamp} sorted newest-first
 *   GET  /api/report?f=<name>  → raw JSON of one report file
 *   POST /api/run              → SSE stream; starts run-demo.mjs and forwards output line-by-line
 *
 * Bind: localhost only. No external deps beyond Node built-ins.
 */

import { createServer }            from 'node:http';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath }           from 'node:url';
import { spawn }                   from 'node:child_process';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = join(__dirname, 'reports');
const DEMO_SCRIPT = join(__dirname, 'run-demo.mjs');
const HTML_FILE   = join(__dirname, 'dashboard.html');
const PORT        = 7432;
const HOST        = '127.0.0.1';
const NODE        = process.execPath;

// Only one demo run may be in progress at a time
let runnerProcess = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-cache',
  });
  res.end(payload);
}

function safeBasename(name) {
  // Allow only expected filename characters; reject path traversal
  return /^run-[\w\-.]+\.json$/.test(name) ? name : null;
}

// ---------------------------------------------------------------------------
// Request router
// ---------------------------------------------------------------------------
createServer((req, res) => {
  const url   = new URL(req.url, `http://${req.headers.host}`);
  const path  = url.pathname;

  // -------------------------------------------------------------------------
  // GET / → dashboard HTML
  // -------------------------------------------------------------------------
  if (req.method === 'GET' && (path === '/' || path === '/dashboard.html')) {
    try {
      const html = readFileSync(HTML_FILE, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (e) {
      res.writeHead(500); res.end('dashboard.html not found');
    }
    return;
  }

  // -------------------------------------------------------------------------
  // GET /api/reports → list available reports
  // -------------------------------------------------------------------------
  if (req.method === 'GET' && path === '/api/reports') {
    try {
      const files = readdirSync(REPORTS_DIR)
        .filter((f) => f.endsWith('.json'))
        .sort()
        .reverse()
        .map((f) => ({
          filename:  f,
          timestamp: f.replace(/^run-/, '').replace(/\.json$/, '').replace(/-/g, ':').replace('T', 'T'),
        }));
      json(res, 200, files);
    } catch {
      json(res, 200, []);
    }
    return;
  }

  // -------------------------------------------------------------------------
  // GET /api/report?f=<filename> → single report JSON
  // -------------------------------------------------------------------------
  if (req.method === 'GET' && path === '/api/report') {
    const name = safeBasename(url.searchParams.get('f') ?? '');
    if (!name) { json(res, 400, { error: 'invalid filename' }); return; }
    const full = join(REPORTS_DIR, name);
    if (!existsSync(full)) { json(res, 404, { error: 'not found' }); return; }
    try {
      const raw = readFileSync(full, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(raw),
        'Cache-Control': 'no-cache',
      });
      res.end(raw);
    } catch (e) {
      json(res, 500, { error: e.message });
    }
    return;
  }

  // -------------------------------------------------------------------------
  // GET /api/runner-status → whether a run is in progress
  // -------------------------------------------------------------------------
  if (req.method === 'GET' && path === '/api/runner-status') {
    json(res, 200, { running: runnerProcess !== null });
    return;
  }

  // -------------------------------------------------------------------------
  // POST /api/run → SSE stream of run-demo.mjs output
  // -------------------------------------------------------------------------
  if (req.method === 'POST' && path === '/api/run') {
    if (runnerProcess !== null) {
      json(res, 409, { error: 'A run is already in progress' });
      return;
    }

    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    send('start', { message: 'Starting CollisionLab evidence runner…' });

    runnerProcess = spawn(NODE, [DEMO_SCRIPT], {
      cwd:   dirname(__dirname),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const onData = (chunk) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (line.trim()) send('output', { line });
      }
    };

    runnerProcess.stdout.on('data', onData);
    runnerProcess.stderr.on('data', onData);

    runnerProcess.on('close', (code, signal) => {
      runnerProcess = null;
      send('done', { exitCode: code, signal: signal ?? null });
      res.end();
    });

    runnerProcess.on('error', (err) => {
      runnerProcess = null;
      send('error', { message: err.message });
      res.end();
    });

    req.on('close', () => {
      if (runnerProcess) { runnerProcess.kill(); runnerProcess = null; }
    });

    return;
  }

  res.writeHead(404); res.end('Not found');

}).listen(PORT, HOST, () => {
  console.log(`CollisionLab Evidence Dashboard`);
  console.log(`  URL:  http://${HOST}:${PORT}/`);
  console.log(`  Reports: ${REPORTS_DIR}`);
  console.log('  Press Ctrl+C to stop.');
});
