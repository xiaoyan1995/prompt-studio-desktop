const { chromium } = require('playwright');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log('Navigating to homepage to search for links...');
  await page.goto('http://www.fm80cine.com/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  
  const links = await page.evaluate(() => {
    const results = [];
    const anchors = Array.from(document.querySelectorAll('a'));
    anchors.forEach(a => {
      const text = a.innerText.trim();
      const href = a.getAttribute('href');
      if (text.includes('丧尸') || text.includes('清道夫') || text.includes('116') || text.includes('lapian')) {
        results.push({ text, href });
      }
    });
    return results;
  });
  
  console.log('Links found:', links);
  await browser.close();
}

run().catch(console.error);
