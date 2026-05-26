const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const destFile = path.join(__dirname, 'scraped_lapian_116.txt');
  console.log('Navigating directly to Lapian 116 (Zombie Sweeper AIGC)...');
  await page.goto('http://www.fm80cine.com/lapian/116', { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  
  // Let's scrape the shots/keyframes table or grid
  const data = await page.evaluate(() => {
    const results = [];
    
    // Find all titles/headers on the page
    results.push(`PAGE TITLE: ${document.title}`);
    
    // Let's search for elements representing individual shots/frames
    // On lapian pages, there are typically tables or cards containing: 
    // - Shot Number (镜号)
    // - Duration (时长)
    // - Shot Scale / Framing (景别)
    // - Camera Angle (机位/角度)
    // - Camera Movement (运动)
    // - Description (画面描述)
    // - Audio/Sound (声音/音效)
    // - Function/Beats (叙事功能/节拍)
    
    // Let's capture all table rows or lists of shots
    const rows = document.querySelectorAll('tr, .shot-card, .lapian-row, .shot-item, li');
    rows.forEach((row, idx) => {
      const text = row.innerText.trim().replace(/\s+/g, ' ');
      if (text.length > 20) {
        results.push(`[Element ${idx}]: ${text}`);
      }
    });

    // Also get all div text blocks that might contain descriptions
    const divs = document.querySelectorAll('.markdown-content, div');
    divs.forEach((div, idx) => {
      const text = div.innerText.trim().replace(/\s+/g, ' ');
      // If it contains key words like "景别" or "运镜"
      if (text.includes('景别') || text.includes('运镜') || text.includes('镜号')) {
        if (text.length > 50 && text.length < 1500) {
          results.push(`[Rich Block ${idx}]: ${text}`);
        }
      }
    });
    
    return results;
  });
  
  // Remove duplicates and save
  const uniqueResults = Array.from(new Set(data));
  fs.writeFileSync(destFile, uniqueResults.join('\n\n'), 'utf-8');
  console.log('Saved lapian details to:', destFile);
  
  await browser.close();
}

run().catch(console.error);
