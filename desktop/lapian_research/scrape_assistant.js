const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const destDir = __dirname;
  console.log('Navigating to homepage first to find the "助手" (Assistant) link...');
  
  await page.goto('http://www.fm80cine.com/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  
  // Find the href of the link containing "助手"
  const assistantHref = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('a'));
    for (const a of anchors) {
      if (a.innerText.includes('助手')) {
        return a.getAttribute('href');
      }
    }
    return null;
  });
  
  console.log('Assistant Href found:', assistantHref);
  
  const targetUrl = assistantHref ? `http://www.fm80cine.com${assistantHref}` : 'http://www.fm80cine.com/assistant';
  console.log('Navigating to Assistant URL:', targetUrl);
  
  // Trace all API and upload requests triggered by or on this page
  page.on('request', req => {
    const url = req.url();
    if (url.includes('api') || req.method() === 'POST') {
      console.log(`[REQUEST] Method: ${req.method()} | URL: ${url}`);
    }
  });

  page.on('response', async res => {
    const url = res.url();
    if (url.includes('api') || res.status() === 200) {
      const ct = res.headers()['content-type'] || '';
      if (ct.includes('application/json')) {
        try {
          const body = await res.text();
          console.log(`[RESPONSE JSON] URL: ${url}\nBody Keys:`, Object.keys(JSON.parse(body)));
          fs.writeFileSync(path.join(destDir, `assistant_${url.replace(/[^a-zA-Z0-9]/g, '_')}.json`), body, 'utf-8');
        } catch (e) {}
      }
    }
  });

  await page.goto(targetUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  
  // Grab the DOM of the assistant page to see form elements, buttons, and upload actions
  const domInfo = await page.evaluate(() => {
    const info = {};
    info.title = document.title;
    info.html = document.body.innerHTML;
    
    // Find upload inputs or drag drop areas
    const inputs = Array.from(document.querySelectorAll('input[type="file"]')).map(el => ({
      id: el.id,
      name: el.name,
      className: el.className,
      accept: el.getAttribute('accept')
    }));
    info.inputs = inputs;
    
    // Find JS files loaded specifically for the assistant
    const scripts = Array.from(document.querySelectorAll('script')).map(el => el.getAttribute('src')).filter(Boolean);
    info.scripts = scripts;
    
    return info;
  });
  
  console.log('DOM Title:', domInfo.title);
  console.log('File Inputs on page:', domInfo.inputs);
  
  fs.writeFileSync(path.join(destDir, 'assistant_dom.html'), domInfo.html, 'utf-8');
  console.log('Assistant page DOM written to assistant_dom.html');
  
  await browser.close();
}

run().catch(console.error);
