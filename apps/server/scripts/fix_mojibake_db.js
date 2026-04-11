const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const DB_PATH = args.find(a => a.endsWith('.db')) || 'himefit.db';

function isMojibake(text) {
  return typeof text === 'string' && /[ÃÂ?]/.test(text);
}

function fixMojibake(text) {
  if (!isMojibake(text)) return text;
  try {
    const decoded = decodeURIComponent(escape(text));
    return decoded;
  } catch {
    return text;
  }
}

function fixHistory(history) {
  if (!history) return { value: history, changed: false };
  try {
    const arr = JSON.parse(history);
    if (!Array.isArray(arr)) return { value: history, changed: false };
    let changed = false;
    const next = arr.map(item => {
      if (typeof item === 'string') {
        const f = fixMojibake(item);
        if (f !== item) changed = true;
        return f;
      }
      if (item && typeof item === 'object') {
        let localChanged = false;
        const out = { ...item };
        if (typeof out.text === 'string') {
          const f = fixMojibake(out.text);
          if (f !== out.text) { out.text = f; localChanged = true; }
        }
        if (typeof out.message === 'string') {
          const f = fixMojibake(out.message);
          if (f !== out.message) { out.message = f; localChanged = true; }
        }
        if (typeof out.sender === 'string') {
          const f = fixMojibake(out.sender);
          if (f !== out.sender) { out.sender = f; localChanged = true; }
        }
        if (localChanged) changed = true;
        return out;
      }
      return item;
    });
    if (!changed) return { value: history, changed: false };
    return { value: JSON.stringify(next), changed: true };
  } catch {
    return { value: history, changed: false };
  }
}

function backupDb(filePath) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join('_backup', `db_fix_${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, path.basename(filePath));
  fs.copyFileSync(filePath, dest);
  return dest;
}

if (!fs.existsSync(DB_PATH)) {
  console.error(`DB not found: ${DB_PATH}`);
  process.exit(1);
}

const backupPath = backupDb(DB_PATH);
console.log(`Backup created: ${backupPath}`);

const db = new Database(DB_PATH);

let convChanged = 0;
let userChanged = 0;
let convTotal = 0;
let userTotal = 0;

const updateConv = db.prepare('UPDATE conversations SET name=?, history=?, tags=?, notes=? WHERE id=?');
const updateUser = db.prepare('UPDATE panel_users SET fullname=? WHERE username=?');

const convRows = db.prepare('SELECT id, name, history, tags, notes FROM conversations').all();
const userRows = db.prepare('SELECT username, fullname FROM panel_users').all();

const tx = db.transaction(() => {
  for (const row of convRows) {
    convTotal++;
    let changed = false;
    const name = fixMojibake(row.name || '');
    if (name !== row.name) changed = true;
    const tags = fixMojibake(row.tags || '');
    if (tags !== row.tags) changed = true;
    const notes = fixMojibake(row.notes || '');
    if (notes !== row.notes) changed = true;
    const histFix = fixHistory(row.history || '');
    if (histFix.changed) changed = true;

    if (changed) {
      convChanged++;
      if (!DRY_RUN) updateConv.run(name, histFix.value, tags, notes, row.id);
    }
  }

  for (const row of userRows) {
    userTotal++;
    const name = fixMojibake(row.fullname || '');
    if (name !== row.fullname) {
      userChanged++;
      if (!DRY_RUN) updateUser.run(name, row.username);
    }
  }
});

tx();

console.log(`Conversations updated: ${convChanged}/${convTotal}`);
console.log(`Users updated: ${userChanged}/${userTotal}`);
console.log(`Dry run: ${DRY_RUN}`);
