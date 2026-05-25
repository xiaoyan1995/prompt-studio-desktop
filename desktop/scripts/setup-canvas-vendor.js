/**
 * setup-canvas-vendor.js
 * Downloads vendor JS/CSS files needed by canvas.html into studio/vendor/
 * Run once: node scripts/setup-canvas-vendor.js
 */
const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

const VENDOR_DIR = path.join(__dirname, '..', 'studio', 'vendor');

const FILES = [
  { name: 'react.min.js',        url: 'https://unpkg.com/react@18.3.1/umd/react.production.min.js' },
  { name: 'react-dom.min.js',    url: 'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js' },
  { name: 'reactflow.min.js',    url: 'https://unpkg.com/reactflow@11.11.4/dist/umd/index.js' },
  { name: 'reactflow.css',       url: 'https://unpkg.com/reactflow@11.11.4/dist/style.css' },
  { name: 'babel.min.js',        url: 'https://unpkg.com/@babel/standalone@7.27.3/babel.min.js' },
  { name: 'lucide.min.js',       url: 'https://unpkg.com/lucide-react@0.511.0/dist/umd/lucide-react.js' },
];

if (!fs.existsSync(VENDOR_DIR)) fs.mkdirSync(VENDOR_DIR, { recursive: true });

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const proto = url.startsWith('https') ? https : http;

    function request(u) {
      proto.get(u, res => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          file.close();
          fs.unlinkSync(dest);
          return request(res.headers.location);
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlinkSync(dest);
          return reject(new Error(`HTTP ${res.statusCode} for ${u}`));
        }
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
      }).on('error', err => { file.close(); fs.unlinkSync(dest); reject(err); });
    }

    request(url);
  });
}

(async () => {
  console.log('📦 Downloading canvas vendor files to studio/vendor/ ...\n');
  for (const f of FILES) {
    const dest = path.join(VENDOR_DIR, f.name);
    if (fs.existsSync(dest)) {
      console.log(`  ✓ ${f.name} (already exists, skipping)`);
      continue;
    }
    process.stdout.write(`  ⬇  ${f.name} ...`);
    try {
      await download(f.url, dest);
      const kb = Math.round(fs.statSync(dest).size / 1024);
      console.log(` done (${kb} KB)`);
    } catch (e) {
      console.log(` FAILED: ${e.message}`);
    }
  }
  console.log('\n✅  All vendor files ready. You can now use canvas.html.');
})();
