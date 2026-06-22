// ════════════════════════════════════════════════════════════════════════
// ChurchOS — backup/restore safety test (pure + validation logic)
//   node tests/backup-test.cjs
// The file-copy IO runs in Electron; here we verify the parts that decide
// whether your data is safe: stamp format, prune retention, and — critically —
// that restore() refuses anything that isn't a real ChurchOS database.
// ════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const os = require('os');
const path = require('path');
const backup = require('../electron/backup.cjs');

let pass = 0, fail = 0; const fails = [];
const check = (id, ok) => { (ok ? pass++ : (fail++, fails.push(id))); console.log(`  ${ok ? '✅' : '❌'} ${id}`); };

console.log('\n💾  Backup/restore safety\n');

// stamp(): sortable, filename-safe, zero-padded
check('stamp-format', backup.stamp(new Date(2027, 5, 3, 9, 7, 5)) === '20270603-090705');

// pickToPrune(): keep newest N, return the rest to delete
const list = [5, 4, 3, 2, 1].map((n) => ({ path: 'b' + n, mtime: n }));
const pruned = backup.pickToPrune(list, 3);
check('prune-keeps-newest-3', pruned.length === 2 && pruned.join(',') === 'b2,b1');
check('prune-keep-bigger-than-list', backup.pickToPrune(list, 14).length === 0);

// isValidBackup(): the gate that protects you from restoring garbage
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'churchos-bk-'));
const { DatabaseSync } = require('node:sqlite');

const good = path.join(tmp, 'good.db');
let g = new DatabaseSync(good); g.exec('CREATE TABLE store (key TEXT PRIMARY KEY, value TEXT)'); g.close();
check('valid-churchos-db-accepted', backup.isValidBackup(good) === true);

const wrongSchema = path.join(tmp, 'wrong.db');
let w = new DatabaseSync(wrongSchema); w.exec('CREATE TABLE notes (id INTEGER)'); w.close();
check('sqlite-without-store-rejected', backup.isValidBackup(wrongSchema) === false);

const garbage = path.join(tmp, 'photo.jpg');
fs.writeFileSync(garbage, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]));
check('non-sqlite-file-rejected', backup.isValidBackup(garbage) === false);

const missing = path.join(tmp, 'nope.db');
check('missing-file-restore-blocked', backup.restore(missing).ok === false);
check('garbage-file-restore-blocked', backup.restore(garbage).error === 'not_a_churchos_backup');

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }

console.log(`\n${'─'.repeat(50)}`);
console.log(`RESULT: ${pass} passed, ${fail} failed${fail ? '  →  ' + fails.join(', ') : ''}`);
console.log(`${'─'.repeat(50)}`);
process.exit(fail ? 1 : 0);
