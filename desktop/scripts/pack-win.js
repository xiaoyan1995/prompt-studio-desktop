/**
 * Post-build script for Windows.
 * Creates a distribution zip with 3 sibling folders:
 *   Prompt Studio Desktop/   <- the electron app (win-unpacked)
 *   extension/               <- browser extension
 *   skills/                  <- agent skills
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const DESKTOP = path.resolve(__dirname, '..');
const DIST = path.join(DESKTOP, 'dist');
const UNPACKED = path.join(DIST, 'win-unpacked');

const pkg = JSON.parse(fs.readFileSync(path.join(DESKTOP, 'package.json'), 'utf8'));
const version = pkg.version;
const appName = pkg.build?.productName || 'Prompt Studio Desktop';
const zipName = `${appName}-${version}-win-full.zip`;
const zipOut = path.join(DIST, zipName);

// Stage dir
const STAGE = path.join(DIST, '_stage');
if (fs.existsSync(STAGE)) fs.rmSync(STAGE, { recursive: true });
fs.mkdirSync(STAGE, { recursive: true });

// 1. Copy win-unpacked → stage/Prompt Studio Desktop/
console.log(`Copying app...`);
copyDir(UNPACKED, path.join(STAGE, appName));

// 2. Copy extension/
const extSrc = path.join(ROOT, 'extension');
if (fs.existsSync(extSrc)) {
  console.log('Copying extension...');
  copyDir(extSrc, path.join(STAGE, 'extension'));
} else {
  console.warn('extension/ not found, skipping');
}

// 3. Copy skills/
const skillsSrc = path.join(ROOT, 'skills');
if (fs.existsSync(skillsSrc)) {
  console.log('Copying skills...');
  copyDir(skillsSrc, path.join(STAGE, 'skills'));
} else {
  console.warn('skills/ not found, skipping');
}

// 4. Zip the stage dir (replace old zip)
if (fs.existsSync(zipOut)) fs.rmSync(zipOut);
console.log(`Creating ${zipName}...`);
try {
  // Use PowerShell Compress-Archive (Windows)
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Force -Path '${STAGE}\\*' -DestinationPath '${zipOut}'"`,
    { stdio: 'inherit' }
  );
} catch {
  // Fallback: 7z if available
  execSync(`7z a -tzip "${zipOut}" "${STAGE}\\*"`, { stdio: 'inherit', cwd: STAGE });
}

// 5. Cleanup stage
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
