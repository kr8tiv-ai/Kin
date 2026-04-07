import { readdirSync } from 'fs';
const dir = process.argv[2] || '.';
try { console.log(readdirSync(dir).join('\n')); } catch(e) { console.log('ERROR:', e.message); }
