'use strict';

// Pure logic for watch-rotate: snapshot naming, parsing and pruning.
// Kept free of I/O so it can be unit-tested without touching the disk.

const TS_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)$/;

// "2026-10-29T10:15:30.123Z" -> "2026-10-29T10-15-30-123Z" (filename-safe).
function formatTimestamp(date) {
  return date.toISOString().replace(/:/g, '-').replace('.', '-');
}

// "sub/dir/file.txt" -> "sub__dir__file.txt"; plain names pass through.
function flattenRel(rel) {
  return rel.split('/').join('__');
}

// Inverse of flattenRel for display purposes.
function unflattenName(flat) {
  return flat.split('__').join('/');
}

// Build a snapshot filename for a file relative to the watched dir.
// Example: notes.txt + 2026-10-29T10-15-30-123Z -> notes.2026-10-29T10-15-30-123Z.txt
// Subdirectory files: sub/notes.txt -> sub__notes.2026-10-29T10-15-30-123Z.txt
function snapshotName(rel, date) {
  const flat = flattenRel(rel);
  const ts = formatTimestamp(date);
  const dot = flat.lastIndexOf('.');
  if (dot > 0) return flat.slice(0, dot) + '.' + ts + flat.slice(dot);
  return flat + '.' + ts;
}

// Parse a snapshot filename back to { original, ts } or null when the
// name is not a snapshot produced by snapshotName. The timestamp segment
// is matched explicitly, so extensionless files and dotted basenames
// both round-trip (splitting on the last dot alone breaks the former).
function parseSnapshot(name) {
  const m = name.match(/^(.*)\.(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)(\..*)?$/);
  if (!m) return null;
  const flatBase = m[1];
  const ts = m[2];
  const ext = m[3] || '';
  if (!flatBase || !TS_RE.test(ts)) return null;
  return { original: unflattenName(flatBase) + ext, ts };
}

// Group snapshot filenames by their original file, newest first.
// Input: array of filenames (not full paths). Output: Map original -> [names newest first].
function groupSnapshots(names) {
  const groups = new Map();
  for (const name of names) {
    const parsed = parseSnapshot(name);
    if (!parsed) continue;
    if (!groups.has(parsed.original)) groups.set(parsed.original, []);
    groups.get(parsed.original).push({ name, ts: parsed.ts });
  }
  for (const list of groups.values()) list.sort((a, b) => (a.ts < b.ts ? 1 : -1));
  return new Map([...groups.entries()].map(([k, v]) => [k, v.map((x) => x.name)]));
}

// Given all filenames present in the backup dir, return the ones that
// must be deleted so that at most `keep` newest snapshots per original
// file remain. keep must be >= 1.
function selectPrune(names, keep) {
  if (!Number.isInteger(keep) || keep < 1) {
    throw new Error('keep must be an integer >= 1');
  }
  const doomed = [];
  for (const list of groupSnapshots(names).values()) {
    doomed.push(...list.slice(keep));
  }
  return doomed.sort();
}

module.exports = { formatTimestamp, flattenRel, unflattenName, snapshotName, parseSnapshot, groupSnapshots, selectPrune };
