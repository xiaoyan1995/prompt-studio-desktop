const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'http___www_fm80cine_com_user_api_movies_1278.json');
const json = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

console.log('=== MOVIE JSON ROOT KEYS ===');
console.log(Object.keys(json));

if (json.data) {
  console.log('\n=== DATA OBJECT KEYS ===');
  console.log(Object.keys(json.data));
  
  const d = json.data;
  console.log('\nMovie Name:', d.title || d.name);
  console.log('Director:', d.director);
  console.log('Publish Year:', d.year);
  
  // Let's print the structural subsections of the data
  console.log('\n=== DETAIL STRUCTURES ===');
  
  // 1. Overview
  if (d.overview) {
    console.log('\n[overview] Keys:', Object.keys(d.overview));
    console.log('Overview sample:', d.overview.oneLineSynopsis);
  }
  
  // 2. Beats (结构节拍)
  if (d.beats) {
    console.log('\n[beats] Type:', Array.isArray(d.beats) ? `Array (length: ${d.beats.length})` : typeof d.beats);
    if (Array.isArray(d.beats)) {
      console.log('Beats sample:', d.beats[0]);
    } else {
      console.log('Beats content keys:', Object.keys(d.beats));
      // If beats contains Markdown or rich fields
      for (const k of Object.keys(d.beats)) {
        console.log(`  - ${k}: ${typeof d.beats[k]} (sample: ${String(d.beats[k]).substring(0, 100)}...)`);
      }
    }
  }
  
  // 3. Characters (人物角色)
  if (d.characters) {
    console.log('\n[characters] Type:', Array.isArray(d.characters) ? `Array (length: ${d.characters.length})` : typeof d.characters);
    if (Array.isArray(d.characters)) {
      console.log('Characters sample:', d.characters[0]);
    } else {
      console.log('Characters keys:', Object.keys(d.characters));
    }
  }

  // 4. Lapian / Shots (视听拉片)
  if (d.lapian) {
    console.log('\n[lapian] Type:', typeof d.lapian);
    console.log('Lapian keys:', Object.keys(d.lapian));
  }
  if (d.shots) {
    console.log('\n[shots] Type:', Array.isArray(d.shots) ? `Array (length: ${d.shots.length})` : typeof d.shots);
    if (Array.isArray(d.shots) && d.shots.length > 0) {
      console.log('Shots Sample Keys:', Object.keys(d.shots[0]));
      console.log('Shots Sample Content:', JSON.stringify(d.shots[0], null, 2));
    }
  }
}
