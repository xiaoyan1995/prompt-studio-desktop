const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const destDir = __dirname;
  console.log('Fetching assistant page DOM directly...');
  
  try {
    // Navigate directly to the assistant route (based on standard Chinese naming or /assistant)
    await page.goto('http://www.fm80cine.com/assistant', { waitUntil: 'domcontentloaded', timeout: 8000 });
  } catch (e) {
    console.log('Failed assistant navigation, trying helper or parsing links...');
    await page.goto('http://www.fm80cine.com/', { waitUntil: 'domcontentloaded' });
    const href = await page.evaluate(() => {
      const a = Array.from(document.querySelectorAll('a')).find(el => el.innerText.includes('助手'));
      return a ? a.getAttribute('href') : null;
    });
    console.log('Found href via homepage:', href);
    if (href) {
      await page.goto(`http://www.fm80cine.com${href}`, { waitUntil: 'domcontentloaded' });
    }
  }

  await page.waitForTimeout(2000);
  
  // Scrape the DOM body
  const domInfo = await page.evaluate(() => {
    return {
      title: document.title,
      url: window.location.href,
      html: document.body.innerHTML
    };
  });
  
  console.log('Navigated URL:', domInfo.url);
  fs.writeFileSync(path.join(destDir, 'assistant_dom.html'), domInfo.html, 'utf-8');
  console.log('Assistant DOM successfully written!');
  
  await browser.close();
}

run().catch(console.error);
