const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const outputDir = __dirname;
  console.log('Researching inside isolated folder:', outputDir);

  // Intercept all JSON API responses to catch movie details and lapian data
  page.on('response', async response => {
    const url = response.url();
    const contentType = response.headers()['content-type'] || '';
    
    if (contentType.includes('application/json') || url.includes('/api/') || url.includes('/user-api/')) {
      try {
        const text = await response.text();
        const json = JSON.parse(text);
        
        let filename = '';
        if (url.includes('/release-note/')) {
          filename = 'api_release_note.json';
        } else if (url.includes('/movies/') || url.includes('/movie/')) {
          const match = url.match(/movies?\/(\d+)/);
          filename = match ? `api_movie_${match[1]}.json` : 'api_movie_detail.json';
        } else if (url.includes('/lapian/') || url.includes('/lapians/')) {
          const match = url.match(/lapians?\/(\d+)/);
          filename = match ? `api_lapian_${match[1]}.json` : 'api_lapian_detail.json';
        } else if (url.includes('/home')) {
          filename = 'api_home.json';
        }

        if (filename) {
          const dest = path.join(outputDir, filename);
          fs.writeFileSync(dest, JSON.stringify(json, null, 2), 'utf-8');
          console.log(`Saved API payload: ${filename} (URL: ${url})`);
        }
      } catch (e) {
        // Not a JSON response or failed to read
      }
    }
  });

  console.log('Navigating to Movie Page (movies/1278 - Hachiko)...');
  await page.goto('http://www.fm80cine.com/movies/1278', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  console.log('Navigating to Lapian List/Detail (lapian/116 - Zombie Sweeper AIGC)...');
  await page.goto('http://www.fm80cine.com/lapian/116', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Let's also scrape the DOM of the active tab to extract written texts for prompts
  const pageTexts = await page.evaluate(() => {
    const sections = [];
    const elements = document.querySelectorAll('.markdown-content, .content-section, td, th, p, h2, h3');
    elements.forEach(el => {
      const text = el.innerText.trim();
      if (text.length > 20) {
        sections.push(`[${el.tagName} ${el.className}]: ${text}`);
      }
    });
    return sections.slice(0, 100);
  });
  
  fs.writeFileSync(path.join(outputDir, 'scraped_text_samples.txt'), pageTexts.join('\n\n'), 'utf-8');
  console.log('Saved scraped_text_samples.txt');

  await browser.close();
  console.log('Research complete. Inspecting files inside:', outputDir);
}

run().catch(console.error);
