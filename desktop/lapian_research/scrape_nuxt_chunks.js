const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const destDir = __dirname;
  const scriptUrls = new Set();
  
  // Intercept script loads
  page.on('request', req => {
    const url = req.url();
    if (url.includes('/_nuxt/') && url.endsWith('.js')) {
      scriptUrls.add(url);
    }
  });

  console.log('Navigating to http://www.fm80cine.com/assistant to trigger lazy loaded chunks...');
  await page.goto('http://www.fm80cine.com/assistant', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  
  console.log('Nuxt dynamic chunk scripts found:', Array.from(scriptUrls));
  
  for (const url of scriptUrls) {
    const filename = path.basename(url).split('?')[0];
    console.log(`Downloading chunk: ${filename}`);
    try {
      const res = await fetch(url);
      if (res.status === 200) {
        const text = await res.text();
        fs.writeFileSync(path.join(destDir, filename), text, 'utf-8');
        console.log(`Saved: ${filename}`);
        
        // Scan for API calls and upload handlers
        const matches = text.match(/user-api\/[a-zA-Z0-9_\-\/]+/g) || [];
        const uniqueMatches = Array.from(new Set(matches));
        if (uniqueMatches.length > 0) {
          console.log(`  - API endpoints found inside ${filename}:`, uniqueMatches);
        }
      }
    } catch (e) {
      console.log(`Failed to download ${url}:`, e.message);
    }
  }
  
  await browser.close();
}

run().catch(console.error);
