import { fetchAndCacheCardDb } from '../server/data.ts';

console.log('Hearthstone Card Database Updater\n');
fetchAndCacheCardDb()
  .then(db => {
    console.log(`\nDone. ${Object.keys(db).length} collectible cards cached.`);
    console.log('You can now run the calculator with: npm run cli');
  })
  .catch(err => {
    console.error('Failed to fetch card data:', err);
    process.exit(1);
  });
