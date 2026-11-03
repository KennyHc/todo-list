// Fails the build if a signed-out visitor downloads too much JS, if Firestore leaks onto the
// landing path, or if the e2e test hook ships. Run after `npm run build`.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = 160;
const dist = new URL('../dist/', import.meta.url).pathname;
const manifest = JSON.parse(readFileSync(join(dist, '.vite/manifest.json'), 'utf8'));

const gz = (file) => gzipSync(readFileSync(join(dist, file))).length;
const kb = (n) => (n / 1024).toFixed(1).padStart(8) + ' KB';

const entry = Object.values(manifest).find((c) => c.isEntry);
if (!entry) throw new Error('No entry chunk in dist/.vite/manifest.json');

// The entry plus everything it imports statically: what loads before any lazy import().
const initial = new Set();
const visit = (key) => {
  const chunk = manifest[key];
  if (!chunk || initial.has(chunk.file)) return;
  initial.add(chunk.file);
  (chunk.imports ?? []).forEach(visit);
};
visit(Object.keys(manifest).find((k) => manifest[k] === entry));

const jsFiles = readdirSync(join(dist, 'assets')).filter((f) => f.endsWith('.js'));
const sizes = jsFiles.map((f) => ({
  file: `assets/${f}`,
  gzip: gz(`assets/${f}`),
  initial: initial.has(`assets/${f}`),
}));
const total = sizes.reduce((sum, c) => sum + c.gzip, 0);
const landing = sizes.filter((c) => c.initial).reduce((sum, c) => sum + c.gzip, 0);

console.log('Top chunks (gzip):');
for (const c of [...sizes].sort((a, b) => b.gzip - a.gzip).slice(0, 12)) {
  console.log(`${kb(c.gzip)}  ${c.initial ? 'landing' : 'lazy   '}  ${c.file}`);
}
console.log(`\nLanding JS (entry + static imports): ${kb(landing)}  (budget ${BUDGET_KB} KB)`);
console.log(`All JS:                              ${kb(total)}`);

const problems = [];
if (landing > BUDGET_KB * 1024) problems.push(`landing JS is over the ${BUDGET_KB} KB budget`);
for (const c of sizes.filter((c) => c.initial)) {
  const text = readFileSync(join(dist, c.file), 'utf8');
  if (/firestore/i.test(c.file) || text.includes('FirestoreError')) {
    problems.push(`${c.file} is on the landing path but contains Firestore`);
  }
}
for (const f of jsFiles) {
  if (readFileSync(join(dist, 'assets', f), 'utf8').includes('__e2e')) {
    problems.push(`assets/${f} contains the e2e test hook (__e2e)`);
  }
}

if (problems.length) {
  console.error('\n' + problems.map((p) => `FAIL: ${p}`).join('\n'));
  process.exit(1);
}
console.log('\nOK');
