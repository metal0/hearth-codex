import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log(`
========================================
  Collection Export Helper
========================================

Since Hearthstone Deck Tracker reads collection data from Hearthstone's
memory (not saved to disk), the easiest way to export your collection
is through HSReplay.net's website.

OPTION 1: Browser Console (recommended)
----------------------------------------
1. Go to https://hsreplay.net/collection/mine/
2. Log in if needed
3. Open browser DevTools (F12) > Network tab
4. Refresh the page
5. Look for a request to an API endpoint containing "collection"
   (usually something like /api/v1/collection/)
6. Click it > Preview tab > copy the JSON response
7. Save it to: ${join(__dirname, '..', 'data', 'my-collection.json')}

OPTION 2: HSReplay Collection Page Scrape
-----------------------------------------
1. Go to https://hsreplay.net/collection/mine/
2. Open browser DevTools (F12) > Console tab
3. Paste this script:

   fetch('/api/v1/collection/', {
     credentials: 'include',
     headers: { 'Accept': 'application/json' }
   })
   .then(r => r.json())
   .then(data => {
     const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
     const a = document.createElement('a');
     a.href = URL.createObjectURL(blob);
     a.download = 'my-collection.json';
     a.click();
   });

4. This will download your collection as a JSON file
5. Move it to: ${join(__dirname, '..', 'data', 'my-collection.json')}

After exporting, run the calculator:
  npm run cli
  > Choose "Import from JSON file"
  > Enter the path to your collection JSON
`);

const sampleCollection = {
  collection: {
    "906": [2, 0],
    "1004": [2, 1],
    "48625": [1, 0],
  },
  dust: 5000,
  gold: 2000,
};

const samplePath = join(__dirname, '..', 'data', 'sample-collection.json');
writeFileSync(samplePath, JSON.stringify(sampleCollection, null, 2));
console.log(`Sample collection format saved to: ${samplePath}`);
console.log('Use this as a reference for the expected JSON structure.\n');
