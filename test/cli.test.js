'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BIN = path.join(__dirname, '..', 'bin', 'watch-rotate.js');

function run(args) {
  return spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8' });
}

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'watch-rotate-'));
}

async function waitFor(cond, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (cond()) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return cond();
}

test('--help exits 0 and mentions required flags', () => {
  const r = run(['--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /--dir/);
  assert.match(r.stdout, /--backup-dir/);
  assert.match(r.stdout, /--write/);
});

test('--version prints the version', () => {
  const r = run(['--version']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /watch-rotate 1\.0\.0/);
});

test('missing required flag exits 2, missing folder exits 1', () => {
  assert.equal(run(['--dir', 'x']).status, 2);
  assert.equal(run(['--dir', '/definitely/not/here-xyz', '--backup-dir', 'bak']).status, 1);
});

test('backup dir inside watched dir exits 2', () => {
  const root = tmpdir();
  const r = run(['--dir', root, '--backup-dir', path.join(root, 'bak')]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /must not be inside/);
});

test('end-to-end: --write snapshots a changed file and prunes to --keep', async () => {
  const root = tmpdir();
  const src = path.join(root, 'src');
  const bak = path.join(root, 'bak');
  fs.mkdirSync(src);
  const target = path.join(src, 'notes.txt');
  fs.writeFileSync(target, 'v1\n');
  const child = spawn(process.execPath, [BIN, '--dir', src, '--backup-dir', bak, '--keep', '2', '--write', '--debounce', '100'], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await waitFor(() => fs.existsSync(bak) || true, 1000); // process starts regardless
    // Three successive edits must leave exactly 2 snapshots (keep=2).
    for (const v of ['v2\n', 'v3\n', 'v4\n']) {
      fs.writeFileSync(target, v);
      await new Promise((r) => setTimeout(r, 600));
    }
    const ok = await waitFor(() => fs.existsSync(bak) && fs.readdirSync(bak).length === 2);
    assert.ok(ok, `expected exactly 2 snapshots, got: ${fs.existsSync(bak) ? fs.readdirSync(bak).join(', ') : '(no backup dir)'}`);
    const names = fs.readdirSync(bak);
    assert.ok(names.every((n) => n.startsWith('notes.') && n.endsWith('.txt')));
    const newest = names.sort().at(-1);
    assert.equal(fs.readFileSync(path.join(bak, newest), 'utf8'), 'v4\n');
  } finally {
    child.kill('SIGINT');
    await new Promise((r) => child.on('exit', r));
  }
});

test('end-to-end: dry-run default writes nothing', async () => {
  const root = tmpdir();
  const src = path.join(root, 'src');
  const bak = path.join(root, 'bak');
  fs.mkdirSync(src);
  const target = path.join(src, 'notes.txt');
  fs.writeFileSync(target, 'v1\n');
  const child = spawn(process.execPath, [BIN, '--dir', src, '--backup-dir', bak, '--debounce', '100'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d; });
  try {
    await new Promise((r) => setTimeout(r, 500));
    fs.writeFileSync(target, 'v2\n');
    await new Promise((r) => setTimeout(r, 1200));
    assert.equal(fs.existsSync(bak), false);
    assert.match(stderr, /would-snapshot/);
  } finally {
    child.kill('SIGINT');
    await new Promise((r) => child.on('exit', r));
  }
});
