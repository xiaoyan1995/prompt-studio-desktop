const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'api_home.json');
const json = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

console.log('=== FEATURED LAPIANS ===');
if (json.featuredLapians) {
  json.featuredLapians.forEach(l => {
    console.log(`- Lapian ID: ${l.id}, Name: ${l.name || l.title}, Movie: ${l.movieName || l.movie?.name}`);
  });
}

console.log('\n=== FEATURED SHOTS ===');
if (json.featuredShots) {
  json.featuredShots.slice(0, 10).forEach(s => {
    console.log(`- Shot ID: ${s.id}, Number: ${s.shotNumber}, Lapian ID: ${s.lapianId}, Lapian Name: ${s.lapianName}, Movie: ${s.movieName}`);
  });
}
