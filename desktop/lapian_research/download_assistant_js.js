const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const destDir = __dirname;
  console.log('Opening assistant page to grab all compiled Nuxt JS bundles...');
  
  await page.goto('http://www.fm80cine.com/assistant', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  // Find all script sources
  const scripts = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('script'))
      .map(el => el.getAttribute('src'))
      .filter(Boolean);
  });
  
  console.log('JS Scripts found on page:', scripts);
  
  for (const src of scripts) {
    const url = src.startsWith('http') ? src : `http://www.fm80cine.com${src}`;
    console.log('Downloading script:', url);
    try {
      const res = await fetch(url);
      if (res.status === 200) {
        const jsText = await res.text();
        const baseName = path.basename(src).split('?')[0];
        fs.writeFileSync(path.join(destDir, baseName), jsText, 'utf-8');
        console.log(`Saved: ${baseName}`);
        
        // Search for upload endpoints or workflow markers inside this file!
        const regexes = [
          /\/api\/[a-zA-Z0-9_\-\/]+/g,
          /user-api\/[a-zA-Z0-9_\-\/]+/g,
          /upload[a-zA-Z0-9_]*/gi
        ];
        
        console.log(`--- Scan of ${baseName} ---`);
        for (const reg of regexes) {
          const matches = jsText.match(reg);
          if (matches) {
            console.log(`Match ${reg}:`, Array.from(new Set(matches)).slice(0, 15));
          }
        }
      }
    } catch (e) {
      console.log('Failed to fetch script:', url, e.message);
    }
  }
  
  await browser.close();
}

run().catch(console.error);
