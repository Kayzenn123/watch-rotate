# watch-rotate

> Watch a folder and keep timestamped rotating backups of changed files. Daily Tools #23.

## Why

Editing an important file repeatedly (notes, configs, drafts) usually
leaves you with either no backup at all or one overwritten copy: the
version you actually wanted is gone. watch-rotate runs once, watches
the folder, and stores a timestamped snapshot on every real change,
pruning older snapshots so each file keeps only the N newest.
A search for similar tools found only generic folder watchers, which
typically mirror a single latest copy and require dependencies;
watch-rotate has zero dependencies, keeps N timestamped versions per
file, prunes automatically, and defaults to dry-run so trying it
cannot write or delete anything until you pass `--write`.

## Install

```bash
git clone https://github.com/Kayzenn123/watch-rotate.git
cd watch-rotate
# no dependencies
```

Requires: Node >= 18

## Usage

```bash
node bin/watch-rotate.js --dir <folder> --backup-dir <backup-folder> --write
node bin/watch-rotate.js --help
```

| Flag | Function | Default |
| --- | --- | --- |
| `--dir <path>` | Folder to watch (required) | — |
| `--backup-dir <path>` | Folder where snapshots are stored (required) | — |
| `--keep <n>` | Snapshots kept per file (min 1) | 5 |
| `--debounce <ms>` | Delay after the last event before snapshotting | 300 |
| `--recursive` | Also watch subdirectories | off |
| `--match <regex>` | Only snapshot files whose relative path matches | all files |
| `--write` | Actually copy and prune (without it: dry-run, log only) | off |
| `--json` | Emit log lines as JSON objects | off |
| `--help` | Show help | — |
| `--version` | Show version | — |

Logs go to stderr, so stdout stays clean. No colors are emitted, so
`NO_COLOR` is honored trivially. Stop with Ctrl-C (SIGINT) for a
clean exit. Exit codes: 0 clean run/stop, 1 runtime error (for
example a missing watched folder), 2 argument misuse.

## Example output

Command:

```bash
mkdir -p /tmp/watch-rotate-demo/src
echo "draft v1" > /tmp/watch-rotate-demo/src/notes.txt
node bin/watch-rotate.js --dir /tmp/watch-rotate-demo/src --backup-dir /tmp/watch-rotate-demo/bak --keep 2 --write --debounce 100
# (then, while it runs: echo "draft v2" > notes.txt; echo "draft v3" > notes.txt; Ctrl-C)
```

Output (real, copied from an actual run):

```text
2026-10-29T03:16:16.922Z watching dir=/tmp/watch-rotate-demo/src backupDir=/tmp/watch-rotate-demo/bak keep=2 mode=write
2026-10-29T03:16:17.914Z snapshot file=notes.txt dest=notes.2026-10-29T03-16-17-914Z.txt
2026-10-29T03:16:18.617Z snapshot file=notes.txt dest=notes.2026-10-29T03-16-18-617Z.txt
2026-10-29T03:16:19.222Z stopped
notes.2026-10-29T03-16-17-914Z.txt
notes.2026-10-29T03-16-18-617Z.txt
```

A longer run with `--keep 2` and three edits leaves exactly two
snapshots, the oldest pruned automatically, and the newest snapshot
contains the latest content. Without `--write`, the same edit only
logs `would-snapshot` and creates no backup folder at all.

## How it works

1. One `fs.watch` watcher per watched directory (recursive mode adds a
   watcher for each subdirectory, including ones created later).
2. Events are debounced per file, and a size+mtime signature in
   memory drops duplicate events that carry no real change, so one
   edit produces one snapshot.
3. Each snapshot is named `<file>.<timestamp>.<ext>` (subdirectory
   files use `__` as a separator, e.g. `sub__laporan.<ts>.md`), which
   makes snapshots sortable and parseable back to their original file.
4. After every real snapshot, snapshots are grouped per original
   file, sorted newest first, and all but the `--keep` newest are
   deleted. The backup folder must not live inside the watched
   folder, otherwise watching would loop on its own snapshots.

## Limitations

- Only files are snapshotted; directory renames are watched in
  recursive mode but empty directories produce no snapshot.
- Snapshot detection relies on size+mtime, so an edit that restores
  the exact same size and mtime within the debounce window could be
  missed (rare in practice; editors always bump mtime).
- Watching is local only: no network sync, no compression, no
  encryption of snapshots. Snapshot timestamps use the local clock.
- `fs.watch` behavior differs slightly per OS; on Linux a moved-in
  file is snapshotted on its first change event, not on arrival
  without a change.

## Development

```bash
npm test
```

## License

MIT

---
Ringkasan (Bahasa Indonesia): watch-rotate memantau satu folder dan
menyimpan salinan bertimestamp setiap kali sebuah file berubah, lalu
memangkas salinan lama hingga tersisa N terbaru per file. Jalankan
dengan `--dir` dan `--backup-dir`; tanpa `--write` ia hanya mencatat
rencana (dry-run) sehingga aman dicoba. Tanpa dependensi, cukup
Node >= 18, dan berhenti bersih dengan Ctrl-C.
