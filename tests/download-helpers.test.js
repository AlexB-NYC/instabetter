const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('content.js', 'utf8').replace('  initialize();', `  globalThis.__igfsHelpers = { sanitizeFilenamePart, detectPostTimestamp, extensionFromUrl, inferMediaExtension, buildDownloadFilename };`);
class Element {}
class HTMLVideoElement extends Element {}
class HTMLImageElement extends Element {}
const sandbox = {
  console,
  location: { href: 'https://www.instagram.com/p/example/', origin: 'https://www.instagram.com' },
  sessionStorage: { getItem: () => null },
  document: { readyState: 'complete' },
  Element,
  HTMLVideoElement,
  setTimeout,
  clearTimeout,
  URL,
};
vm.runInNewContext(source, sandbox);
const h = sandbox.__igfsHelpers;

assert.strictEqual(h.sanitizeFilenamePart('@nat:geo/team', 'unknown_account'), 'nat_geo_team');
assert.strictEqual(h.sanitizeFilenamePart('', 'unknown_account'), 'unknown_account');
assert.strictEqual(h.detectPostTimestamp({ querySelector: () => ({ getAttribute: () => '2026-07-20T18:42:11-04:00' }) }), '2026-07-20_22-42-11');
assert.strictEqual(h.detectPostTimestamp({ querySelector: () => null }), 'unknown_time');
assert.strictEqual(h.extensionFromUrl('https://cdn.example.com/media/photo.jpeg?se=123'), 'jpeg');
assert.strictEqual(h.buildDownloadFilename({ username: '@natgeo', timestamp: '2026-07-20_18-42-11', extension: '.jpg' }), 'natgeo_2026-07-20_18-42-11.jpg');
assert.strictEqual(h.buildDownloadFilename({ username: 'natgeo', timestamp: '2026-07-20_18-42-11', extension: 'mp4', index: 2, total: 3 }), 'natgeo_2026-07-20_18-42-11_02.mp4');
assert.strictEqual(h.buildDownloadFilename({ username: 'natgeo', timestamp: '2026-07-20_18-42-11', extension: 'jpg', index: 100, total: 100 }), 'natgeo_2026-07-20_18-42-11_100.jpg');
const video = new HTMLVideoElement(); video.tagName = 'VIDEO'; video.getAttribute = (name) => name === 'type' ? 'video/mp4' : '';
assert.strictEqual(h.inferMediaExtension(video, 'https://cdn.example.com/v?id=1'), 'mp4');
const img = new HTMLImageElement(); img.tagName = 'IMG'; img.getAttribute = (name) => name === 'data-mime-type' ? '' : '';
assert.strictEqual(h.inferMediaExtension(img, 'https://cdn.example.com/picture.webp?x=1'), 'webp');
console.log('download helper tests passed');
