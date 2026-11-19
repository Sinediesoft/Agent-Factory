import { writeFileSync } from 'node:fs';
import { DEMO } from '../src/config.js';
import { makeTrackLayout, validateTrackLayout } from '../src/track-layout.js';
const layout = makeTrackLayout(DEMO);
const errors = validateTrackLayout(layout, DEMO);
if (errors.length) throw new Error(errors.join('; '));
writeFileSync(new URL('./track-layout.json', import.meta.url), JSON.stringify(layout, null, 2) + '\n');
console.log(`Track layout: 1 main + ${layout.rings.length} area rings, ${layout.branches.length} branches, ${layout.docks.length} docks`);
