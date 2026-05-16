/**
 * Pack source version (whitelist — only what's needed to run from source):
 *   Prompt Studio Desktop-{version}-source.zip
 *
 * Contents:
 *   desktop/main.js, preload.js, package.json
 *   desktop/studio/server.py, index.html
 *   desktop/scripts/start-electron.js
 *   extension/
 *   skills/
 *   pstudio-cli.py, dev-start.bat, build-mac.command, README.md, README_CN.md
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT    = path.resolve(__dirname, '..', '..');
const DESKTOP = path.resolve(__dirname, '..');
const DIST    = path.join(DESKTOP, 'dist');

fs.mkdirSync(DIST, { recursive: true });

const pkg     = JSON.parse(fs.readFileSync(path.join(DESKTOP, 'package.json'), 'utf8'));
const version = pkg.version;
const zipName = `Prompt Studio Desktop-${version}-source.zip`;
const zipOut  = path.join(DIST, zipName);

const STAGE = path.join(require('os').tmpdir(), `psd-source-${Date.now()}`);
if (fs.existsSync(STAGE)) fs.rmSync(STAGE, { recursive: true });
fs.mkdirSync(STAGE, { recursive: true });

// 1. Specific desktop/ files only (whitelist)
console.log('Copying desktop source files...');
const destDesktop = path.join(STAGE, 'desktop');
fs.mkdirSync(destDesktop, { recursive: true });
for (const f of ['main.js', 'preload.js', 'package.json']) {
  const src = path.join(DESKTOP, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(destDesktop, f));
}
// desktop/studio/  (server.py + index.html only)
const studioSrc  = path.join(DESKTOP, 'studio');
const studioDest = path.join(destDesktop, 'studio');
fs.mkdirSync(studioDest, { recursive: true });
for (const f of ['server.py', 'index.html']) {
  const src = path.join(studioSrc, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(studioDest, f));
}
// desktop/scripts/start-electron.js (needed for npm start)
const scriptsDest = path.join(destDesktop, 'scripts');
fs.mkdirSync(scriptsDest, { recursive: true });
for (const f of ['start-electron.js']) {
  const src = path.join(DESKTOP, 'scripts', f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(scriptsDest, f));
}

// 2. extension/
const extSrc = path.join(ROOT, 'extension');
if (fs.existsSync(extSrc)) { console.log('Copying extension...'); copyDir(extSrc, path.join(STAGE, 'extension')); }
else console.warn('extension/ not found, skipping');

// 3. skills/
const skillsSrc = path.join(ROOT, 'skills');
if (fs.existsSync(skillsSrc)) { console.log('Copying skills...'); copyDir(skillsSrc, path.join(STAGE, 'skills')); }
else console.warn('skills/ not found, skipping');

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

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}
