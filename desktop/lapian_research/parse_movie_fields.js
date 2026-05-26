const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'http___www_fm80cine_com_user_api_movies_1278.json');
const json = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

if (json.data) {
  const d = json.data;
  const fields = ['avStyle', 'creationGuide', 'movieScript', 'analysisSummary'];
  
  fields.forEach(field => {
    console.log(`\n========================================`);
    console.log(`FIELD: ${field}`);
    console.log(`========================================`);
    const val = d[field];
    if (!val) {
      console.log('Empty field.');
    } else {
      console.log('Type:', typeof val);
      if (typeof val === 'object') {
        console.log('Keys:', Object.keys(val));
        console.log('Sample:\n', JSON.stringify(val, null, 2).substring(0, 1000));
      } else {
        console.log('String length:', val.length);
        console.log('Sample text:\n', val.substring(0, 1500));
      }
    }
  });
}
