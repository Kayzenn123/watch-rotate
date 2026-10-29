'use strict';

const VERSION = '1.0.0';

const HELP = `watch-rotate ${VERSION}
Watch a folder and keep timestamped rotating backups of changed files.

Usage:
  watch-rotate --dir <path> --backup-dir <path> [options]

Options:
  --dir <path>         Folder to watch (required)
  --backup-dir <path>  Folder where snapshots are stored (required)
  --keep <n>           Snapshots kept per file (default: 5, min: 1)
  --debounce <ms>      Delay after the last event before snapshotting (default: 300)
  --recursive          Also watch subdirectories
  --match <regex>      Only snapshot files whose relative path matches this regex
  --write              Actually copy and prune (default is dry-run: log only)
  --json               Emit log lines as JSON objects instead of plain text
  --help               Show this help
  --version            Show the version

Behavior:
  By default nothing is written or deleted: every snapshot and prune is only
  logged (dry-run). Pass --write to enable real copies and pruning.
  Logs go to stderr; stdout stays clean. No colors are emitted, so NO_COLOR
  is honored trivially. Stop with Ctrl-C (SIGINT) for a clean exit.
`;

class UsageError extends Error {}

function parseArgs(argv) {
  const opts = {
    dir: null, backupDir: null, keep: 5, debounce: 300,
    recursive: false, match: null, write: false, json: false,
  };
  const flagsWithValue = new Set(['--dir', '--backup-dir', '--keep', '--debounce', '--match']);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help') return { help: true };
    if (arg === '--version') return { version: true };
    if (arg === '--recursive') { opts.recursive = true; continue; }
    if (arg === '--write') { opts.write = true; continue; }
    if (arg === '--json') { opts.json = true; continue; }
    if (flagsWithValue.has(arg)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new UsageError(`flag ${arg} requires a value`);
      }
      i++;
      if (arg === '--dir') opts.dir = value;
      else if (arg === '--backup-dir') opts.backupDir = value;
      else if (arg === '--keep') {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1) throw new UsageError('--keep must be an integer >= 1');
        opts.keep = n;
      } else if (arg === '--debounce') {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 0) throw new UsageError('--debounce must be an integer >= 0');
        opts.debounce = n;
      } else if (arg === '--match') {
        try { opts.match = new RegExp(value); } catch { throw new UsageError(`--match is not a valid regex: ${value}`); }
      }
      continue;
    }
    throw new UsageError(`unknown argument: ${arg}`);
  }
  if (!opts.dir) throw new UsageError('--dir is required');
  if (!opts.backupDir) throw new UsageError('--backup-dir is required');
  return opts;
}

module.exports = { VERSION, HELP, UsageError, parseArgs };
