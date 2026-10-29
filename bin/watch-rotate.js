#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { snapshotName, selectPrune } = require('../src/rotate');
const { VERSION, HELP, UsageError, parseArgs } = require('../src/args');

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof UsageError) {
      process.stderr.write(`error: ${err.message}\nRun: watch-rotate --help\n`);
      process.exit(2);
    }
    throw err;
  }
  if (opts.help) { process.stdout.write(HELP); return; }
  if (opts.version) { process.stdout.write(`watch-rotate ${VERSION}\n`); return; }

  const dir = path.resolve(opts.dir);
  const backupDir = path.resolve(opts.backupDir);

  // Runtime errors (exit 1): watched folder missing, or backup inside it
  // (watching the backup folder would snapshot its own snapshots forever).
  let stat;
  try {
    stat = fs.statSync(dir);
  } catch {
    process.stderr.write(`error: watched folder does not exist: ${dir}\n`);
    process.exit(1);
  }
  if (!stat.isDirectory()) {
    process.stderr.write(`error: --dir is not a directory: ${dir}\n`);
    process.exit(1);
  }
  if (backupDir === dir || backupDir.startsWith(dir + path.sep)) {
    process.stderr.write('error: --backup-dir must not be inside --dir (would cause a watch loop)\n');
    process.exit(2);
  }

  const log = (event, detail) => {
    const line = opts.json
      ? JSON.stringify({ time: new Date().toISOString(), event, ...detail }) + '\n'
      : `${new Date().toISOString()} ${event} ${Object.entries(detail).map(([k, v]) => `${k}=${v}`).join(' ')}\n`;
    process.stderr.write(line);
  };

  // Signature (size + mtime) per relative path, to ignore duplicate
  // events that carry no real change.
  const seen = new Map();
  const timers = new Map();
  const watchers = [];

  const watchOne = (sub) => {
    const abs = path.join(dir, sub);
    let watcher;
    try {
      watcher = fs.watch(abs, (eventType, filename) => {
        if (!filename) return;
        onEvent(path.join(sub, filename));
      });
    } catch (err) {
      log('watch-error', { dir: abs, error: err.message });
      return;
    }
    watcher.on('error', (err) => log('watch-error', { dir: abs, error: err.message }));
    watchers.push(watcher);
  };

  const collectSubdirs = (root) => {
    const out = [];
    const stack = [''];
    while (stack.length) {
      const sub = stack.pop();
      out.push(sub);
      let entries = [];
      try { entries = fs.readdirSync(path.join(root, sub), { withFileTypes: true }); } catch { continue; }
      for (const e of entries) {
        if (e.isDirectory()) stack.push(path.join(sub, e.name));
      }
    }
    return out;
  };

  const onEvent = (rel) => {
    const relPosix = rel.split(path.sep).join('/');
    if (opts.match && !opts.match.test(relPosix)) return;
    if (timers.has(relPosix)) clearTimeout(timers.get(relPosix));
    timers.set(relPosix, setTimeout(() => {
      timers.delete(relPosix);
      handleFile(relPosix).catch((err) => log('error', { file: relPosix, error: err.message }));
    }, opts.debounce));
  };

  const handleFile = async (relPosix) => {
    const abs = path.join(dir, relPosix);
    let st;
    try { st = fs.statSync(abs); } catch { return; } // deleted before debounce: nothing to do
    if (!st.isFile()) {
      // A new subdirectory appeared: watch it too in recursive mode.
      if (opts.recursive && st.isDirectory()) watchOne(relPosix);
      return;
    }
    const sig = `${st.size}:${st.mtimeMs}`;
    if (seen.get(relPosix) === sig) return; // duplicate event, no real change
    seen.set(relPosix, sig);

    const snap = snapshotName(relPosix, new Date());
    const dest = path.join(backupDir, snap);
    if (!opts.write) {
      log('would-snapshot', { file: relPosix, dest: snap });
      return;
    }
    fs.mkdirSync(backupDir, { recursive: true });
    fs.copyFileSync(abs, dest);
    log('snapshot', { file: relPosix, dest: snap });
    // Prune: keep only the newest `keep` snapshots per original file.
    const names = fs.readdirSync(backupDir).filter((n) => {
      try { return fs.statSync(path.join(backupDir, n)).isFile(); } catch { return false; }
    });
    for (const victim of selectPrune(names, opts.keep)) {
      fs.unlinkSync(path.join(backupDir, victim));
      log('pruned', { file: victim });
    }
  };

  if (opts.recursive) {
    for (const sub of collectSubdirs(dir)) watchOne(sub);
  } else {
    watchOne('');
  }

  log('watching', { dir, backupDir, keep: opts.keep, mode: opts.write ? 'write' : 'dry-run' });
  process.on('SIGINT', () => {
    for (const w of watchers) w.close();
    log('stopped', {});
    process.exit(0);
  });
}

main();
