const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const FILES = ['manifest.json', 'content.js', 'content.css', 'background.js'];

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

for (const file of FILES) {
  const source = path.join(ROOT, file);
  if (!fs.existsSync(source)) {
    throw new Error(`Build input is missing: ${file}`);
  }
  fs.copyFileSync(source, path.join(DIST, file));
}

console.log(`Built unpacked extension in ${path.relative(ROOT, DIST)}`);
