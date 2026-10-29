'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { snapshotName, parseSnapshot, groupSnapshots, selectPrune, flattenRel } = require('../src/rotate');
const { parseArgs, UsageError } = require('../src/args');

const D = new Date('2026-10-29T10:15:30.123Z');

test('snapshot name embeds a filename-safe timestamp and round-trips', () => {
  const name = snapshotName('notes.txt', D);
  assert.equal(name, 'notes.2026-10-29T10-15-30-123Z.txt');
  assert.deepEqual(parseSnapshot(name), { original: 'notes.txt', ts: '2026-10-29T10-15-30-123Z' });
});

test('extensionless files and subdirectory files round-trip', () => {
  const a = snapshotName('NOTES', D);
  assert.equal(a, 'NOTES.2026-10-29T10-15-30-123Z');
  assert.deepEqual(parseSnapshot(a), { original: 'NOTES', ts: '2026-10-29T10-15-30-123Z' });
  const b = snapshotName('sub/notes.txt', D);
  assert.equal(b, 'sub__notes.2026-10-29T10-15-30-123Z.txt');
  assert.deepEqual(parseSnapshot(b), { original: 'sub/notes.txt', ts: '2026-10-29T10-15-30-123Z' });
});

test('parseSnapshot rejects non-snapshot names', () => {
  assert.equal(parseSnapshot('notes.txt'), null);
  assert.equal(parseSnapshot('notes.2026-10-29.txt'), null);
  assert.equal(parseSnapshot('.2026-10-29T10-15-30-123Z.txt'), null);
});

test('groupSnapshots sorts newest first and ignores foreign files', () => {
  const groups = groupSnapshots([
    'a.2026-10-29T10-00-00-000Z.txt',
    'README.md',
    'a.2026-10-29T11-00-00-000Z.txt',
    'a.2026-10-29T09-00-00-000Z.txt',
    'b.2026-10-29T08-00-00-000Z.md',
  ]);
  assert.deepEqual(groups.get('a.txt'), [
    'a.2026-10-29T11-00-00-000Z.txt',
    'a.2026-10-29T10-00-00-000Z.txt',
    'a.2026-10-29T09-00-00-000Z.txt',
  ]);
  assert.deepEqual(groups.get('b.md'), ['b.2026-10-29T08-00-00-000Z.md']);
});

test('selectPrune keeps N newest per file and nothing else', () => {
  const names = [
    'a.2026-10-29T09-00-00-000Z.txt',
    'a.2026-10-29T10-00-00-000Z.txt',
    'a.2026-10-29T11-00-00-000Z.txt',
    'b.2026-10-29T08-00-00-000Z.md',
    'b.2026-10-29T09-00-00-000Z.md',
  ];
  assert.deepEqual(selectPrune(names, 2), [
    'a.2026-10-29T09-00-00-000Z.txt',
  ]);
  assert.deepEqual(selectPrune(names, 1), [
    'a.2026-10-29T09-00-00-000Z.txt',
    'a.2026-10-29T10-00-00-000Z.txt',
    'b.2026-10-29T08-00-00-000Z.md',
  ]);
  assert.deepEqual(selectPrune(names, 5), []);
});

test('selectPrune rejects keep < 1', () => {
  assert.throws(() => selectPrune([], 0), /keep must be/);
});

test('flattenRel joins path segments with double underscore', () => {
  assert.equal(flattenRel('a/b/c.txt'), 'a__b__c.txt');
  assert.equal(flattenRel('plain.txt'), 'plain.txt');
});

test('parseArgs defaults and flags', () => {
  const o = parseArgs(['--dir', 'src', '--backup-dir', 'bak', '--keep', '3', '--write']);
  assert.equal(o.dir, 'src');
  assert.equal(o.backupDir, 'bak');
  assert.equal(o.keep, 3);
  assert.equal(o.write, true);
  assert.equal(o.debounce, 300);
  assert.equal(o.recursive, false);
});

test('parseArgs rejects missing flags, bad keep, bad regex, unknown flags', () => {
  assert.throws(() => parseArgs(['--dir', 'x']), UsageError);
  assert.throws(() => parseArgs(['--dir', 'x', '--backup-dir', 'y', '--keep', '0']), UsageError);
  assert.throws(() => parseArgs(['--dir', 'x', '--backup-dir', 'y', '--keep', 'abc']), UsageError);
  assert.throws(() => parseArgs(['--dir', 'x', '--backup-dir', 'y', '--match', '[']), UsageError);
  assert.throws(() => parseArgs(['--dir', 'x', '--backup-dir', 'y', '--bogus']), UsageError);
  assert.throws(() => parseArgs(['--dir']), UsageError);
});
