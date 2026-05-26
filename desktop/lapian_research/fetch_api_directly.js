const fs = require('fs');
const path = require('path');

const endpoints = [
  'http://www.fm80cine.com/user-api/movies/1278',
  'http://www.fm80cine.com/user-api/lapians/116',
  'http://www.fm80cine.com/user-api/lapian/116',
  'http://www.fm80cine.com/user-api/lapians/details/116',
  'http://www.fm80cine.com/user-api/lapians/shots/116',
  'http://www.fm80cine.com/user-api/shots?lapianId=116',
];

async function run() {
  for (const url of endpoints) {
    console.log('Fetching:', url);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      console.log('Status:', res.status);
      if (res.status === 200) {
        const json = await res.json();
        const safeName = url.replace(/[^a-zA-Z0-9]/g, '_') + '.json';
        fs.writeFileSync(path.join(__dirname, safeName), JSON.stringify(json, null, 2), 'utf-8');
        console.log('Successfully saved to:', safeName);
      }
    } catch (e) {
      console.log('Error fetching:', url, e.message);
    }
  }
}

run();
