/**
 * Pack source version:
 *   Prompt Studio Desktop-{version}-source.zip
 *
 * Contents:
 *   desktop/          ← Electron source (no node_modules, no dist, no server-dist)
 *   extension/        ← browser extension
 *   skills/           ← agent skills
 *   pstudio-cli.py
 *   dev-start.bat
 *   build-mac.command
 *   README.md
 *   README_CN.md
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT    = path.resolve(__dirname, '..', '..');
const DESKTOP = path.resolve(__dirname, '..');
const DIST    = path.join(DESKTOP, 'dist');

const pkg     = JSON.parse(fs.readFileSync(path.join(DESKTOP, 'package.json'), 'utf8'));
const version = pkg.version;
const zipName = `Prompt Studio Desktop-${version}-source.zip`;
const zipOut  = path.join(DIST, zipName);

const STAGE = path.join(DIST, '_stage_src');
if (fs.existsSync(STAGE)) fs.rmSync(STAGE, { recursive: true });
fs.mkdirSync(STAGE, { recursive: true });

// Skip patterns for desktop/ folder
const SKIP_DESKTOP = new Set(['node_modules', 'dist', 'server-dist', '.cache', '__pycache__']);

// 1. desktop/ (source only, skip build artifacts)
console.log('Copying desktop source...');
copyDir(DESKTOP, path.join(STAGE, 'desktop'), SKIP_DESKTOP);

// 2. extension/
const extSrc = path.join(ROOT, 'extension');
if (fs.existsSync(extSrc)) {
  console.log('Copying extension...');
  copyDir(extSrc, path.join(STAGE, 'extension'));
} else console.warn('extension/ not found, skipping');

// 3. skills/
const skillsSrc = path.join(ROOT, 'skills');
if (fs.existsSync(skillsSrc)) {
  console.log('Copying skills...');
  copyDir(skillsSrc, path.join(STAGE, 'skills'));
} else console.warn('skills/ not found, skipping');

// 4. Root files
for (const f of ['pstudio-cli.py', 'dev-start.bat', 'build-mac.command', 'README.md', 'README_CN.md']) {
  const src = path.join(ROOT, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(STAGE, f));
}

// 5. Zip
if (fs.existsSync(zipOut)) fs.rmSync(zipOut);
console.log(`Creating ${zipName}...`);
try {
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Force -Path '${STAGE}\\*' -DestinationPath '${zipOut}'"`,
    { stdio: 'inherit' }
  );
} catch {
  execSync(`7z a -tzip "${zipOut}" "${STAGE}\\*"`, { stdio: 'inherit', cwd: STAGE });
}

fs.rmSync(STAGE, { recursive: true });

const sizeMB = (fs.statSync(zipOut).size / 1024 / 1024).toFixed(1);
console.log(`\nDone! ${zipName} (${sizeMB} MB)`);
console.log(`Path: ${zipOut}`);

function copyDir(src, dest, skip = new Set()) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d, skip);
    else fs.copyFileSync(s, d);
  }
}
