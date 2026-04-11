const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { resolveAppPaths } = require('../app_paths');

const ROOT = process.cwd();
const APP_PATHS = resolveAppPaths(ROOT, process.env, process.platform);
const MUSIC_DIR = APP_PATHS.CACHE_DIR;
const ADS_DIR = APP_PATHS.ADS_DIR;
const REPORTS_DIR = path.join(ROOT, 'reports');
const DUPES_DIR = path.join(APP_PATHS.STORAGE_DIR, '_dupes');

const args = process.argv.slice(2);
const mode = args.find(a => a.startsWith('--mode='))?.split('=')[1] || 'report';
const MOVE_DUPES = mode === 'move';

function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

function findFfprobe() {
  const ffmpegStatic = require('ffmpeg-static');
  if (ffmpegStatic) {
    const dir = path.dirname(ffmpegStatic);
    const cand = path.join(dir, 'ffprobe.exe');
    if (fs.existsSync(cand)) return cand;
  }
  return 'ffprobe';
}

const FFPROBE = findFfprobe();

function runFfprobe(file) {
  return new Promise((resolve) => {
    execFile(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,codec_type,channels,sample_rate,bit_rate', '-of', 'json', file], (err, stdout) => {
      if (err) return resolve({ ok: false, error: err.message });
      try { return resolve({ ok: true, data: JSON.parse(stdout) }); }
      catch (e) { return resolve({ ok: false, error: 'parse_error' }); }
    });
  });
}

function fingerprintFile(file) {
  const stat = fs.statSync(file);
  const size = stat.size;
  const fd = fs.openSync(file, 'r');
  const bufSize = Math.min(2 * 1024 * 1024, size);
  const buf = Buffer.alloc(bufSize);
  fs.readSync(fd, buf, 0, bufSize, 0);
  fs.closeSync(fd);
  const hash = crypto.createHash('sha256').update(buf).update(String(size)).digest('hex');
  return { size, hash };
}

async function scanDir(dir, kind) {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.mp3')).map(f => path.join(dir, f));
  const results = [];
  for (const file of files) {
    const fp = fingerprintFile(file);
    const meta = await runFfprobe(file);
    const entry = { kind, file, size: fp.size, fp: fp.hash, ok: meta.ok, issues: [], duration: 0, codec: null };
    if (!meta.ok) {
      entry.issues.push('ffprobe_failed');
    } else {
      const format = meta.data.format || {};
      const streams = meta.data.streams || [];
      const audioStream = streams.find(s => s.codec_type === 'audio');
      entry.duration = Number(format.duration || 0);
      entry.codec = audioStream?.codec_name || null;
      if (!audioStream) entry.issues.push('no_audio_stream');
      if (!entry.duration || entry.duration <= 0) entry.issues.push('duration_zero');
      if (!entry.codec) entry.issues.push('codec_missing');
      if (entry.duration > 0 && entry.duration < 5) entry.issues.push('too_short');
    }
    results.push(entry);
  }
  return results;
}

function findDuplicates(items) {
  const byFp = {};
  items.forEach(it => { if (!byFp[it.fp]) byFp[it.fp] = []; byFp[it.fp].push(it); });
  const dupes = Object.values(byFp).filter(group => group.length > 1);
  return dupes;
}

function moveDuplicates(dupes) {
  if (!dupes.length) return [];
  ensureDir(DUPES_DIR);
  const moved = [];
  dupes.forEach(group => {
    group.slice(1).forEach(it => {
      const base = path.basename(it.file);
      const dest = path.join(DUPES_DIR, base);
      fs.renameSync(it.file, dest);
      moved.push({ from: it.file, to: dest });
    });
  });
  return moved;
}

async function main() {
  ensureDir(REPORTS_DIR);
  const music = await scanDir(MUSIC_DIR, 'music');
  const ads = await scanDir(ADS_DIR, 'ads');
  const all = [...music, ...ads];
  const dupes = findDuplicates(all);
  const moved = MOVE_DUPES ? moveDuplicates(dupes) : [];

  const now = new Date();
  const stamp = now.toISOString().slice(0, 10);
  const jsonReport = {
    scannedAt: now.toISOString(),
    musicDir: MUSIC_DIR,
    adsDir: ADS_DIR,
    totals: {
      music: music.length,
      ads: ads.length,
      issues: all.filter(i => i.issues.length).length,
      duplicates: dupes.length
    },
    duplicates: dupes.map(g => g.map(i => i.file)),
    moved,
    files: all
  };

  const jsonPath = path.join(REPORTS_DIR, `radio_check_${stamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));

  const mdLines = [];
  mdLines.push(`# Radio Check - ${stamp}`);
  mdLines.push(`- Music files: ${music.length}`);
  mdLines.push(`- Ads files: ${ads.length}`);
  mdLines.push(`- Files with issues: ${all.filter(i => i.issues.length).length}`);
  mdLines.push(`- Duplicate groups: ${dupes.length}`);
  if (moved.length) mdLines.push(`- Duplicates moved: ${moved.length}`);
  mdLines.push(``);
  mdLines.push(`## Issues`);
  all.filter(i => i.issues.length).forEach(i => {
    mdLines.push(`- ${i.file} :: ${i.issues.join(', ')}`);
  });
  mdLines.push(``);
  mdLines.push(`## Duplicates`);
  dupes.forEach(g => {
    mdLines.push(`- ${g.map(i => i.file).join(' | ')}`);
  });

  const mdPath = path.join(REPORTS_DIR, `radio_check_${stamp}.md`);
  fs.writeFileSync(mdPath, mdLines.join('\n'));

  console.log(`Report: ${jsonPath}`);
  console.log(`Report: ${mdPath}`);
}

main().catch(err => {
  console.error('radio_check failed:', err.message);
  process.exit(1);
});
