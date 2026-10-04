// Checks that the API responds and prints a summary of the payload.
// Usage: npm run check:api -- [queue]
import { fetchMeta } from '../src/lib/duels-api.js';

const queue = process.argv[2] ?? 'core-bo1';
const { data, etag } = await fetchMeta({ queue });

console.log(`Queue        : ${data.meta.queueId}`);
console.log(`Updated at   : ${data.updatedAt}`);
console.log(`Games        : ${data.activity.totalGames.toLocaleString('en-US')}`);
console.log(`Current era  : ${data.meta.eras?.currentEra?.key ?? '?'}`);
console.log(`Weeks        : ${data.meta.availableWeeks?.length ?? 0} available`);
console.log(`Color pairs  : ${data.colorPairs.length} · Matchups: ${data.matchups.length}`);
console.log(`ETag         : ${etag}`);
