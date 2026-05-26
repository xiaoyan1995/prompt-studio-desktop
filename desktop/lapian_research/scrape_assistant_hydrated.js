const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const destDir = __dirname;
  console.log('Navigating to http://www.fm80cine.com/assistant and waiting for full hydration...');
  
  try {
    // Navigate and wait for network to be idle (which means Nuxt bundles are fetched)
    await page.goto('http://www.fm80cine.com/assistant', { waitUntil: 'networkidle', timeout: 15000 });
    
    console.log('Network idle. Waiting an extra 4 seconds for react/vue rendering...');
    await page.waitForTimeout(4000);
    
    // Scrape the DOM body
    const domInfo = await page.evaluate(() => {
      return {
        title: document.title,
        url: window.location.href,
        html: document.body.innerHTML
      };
    });
    
    console.log('Navigated URL:', domInfo.url);
    console.log('DOM length:', domInfo.html.length);
    fs.writeFileSync(path.join(destDir, 'assistant_dom.html'), domInfo.html, 'utf-8');
    console.log('Assistant DOM successfully written!');
  } catch (e) {
    console.error('Error occurred:', e);
  }
  
  await browser.close();
}

run().catch(console.error);
