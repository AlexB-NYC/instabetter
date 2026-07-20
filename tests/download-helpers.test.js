const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('content.js', 'utf8').replace('  initialize();', `  globalThis.__igfsHelpers = { sanitizeFilenamePart, detectPostTimestamp, extensionFromUrl, inferMediaExtension, buildDownloadFilename, decodeHtmlEntitiesOnce, isProgressiveHttpsUrl, normalizeVideoCandidates, resolveVideoSource, assertDownloadableUrl, buildDownloadItemForSlide };`);
class Element {}
class HTMLVideoElement extends Element {}
class HTMLImageElement extends Element {}
const scripts = [];
const sandbox = {
  console,
  location: { href: 'https://www.instagram.com/p/example/', origin: 'https://www.instagram.com' },
  sessionStorage: { getItem: () => null },
  document: { readyState: 'complete', querySelectorAll: () => scripts, createElement: () => ({}) },
  Element,
  HTMLVideoElement,
  HTMLImageElement,
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
const video = new HTMLVideoElement(); video.tagName = 'VIDEO'; video.getAttribute = (name) => name === 'type' ? 'video/mp4' : ''; video.querySelector = () => null; video.dataset = {}; video.currentSrc = 'blob:https://www.instagram.com/abc'; video.src = 'blob:https://www.instagram.com/abc';
assert.strictEqual(h.inferMediaExtension(video, 'https://cdn.example.com/v?id=1'), 'mp4');
const img = new HTMLImageElement(); img.tagName = 'IMG'; img.getAttribute = (name) => name === 'data-mime-type' ? '' : '';
assert.strictEqual(h.inferMediaExtension(img, 'https://cdn.example.com/picture.webp?x=1'), 'webp');

const signed = 'https://scontent.cdninstagram.com/o1/v/t16/f2/m86/AQ.mp4?efg=a%253Dkeep%2525&amp;_nc_ht=scontent&amp;_nc_cat=1&amp;_nc_sid=abc%3Ddef';
assert.strictEqual(h.decodeHtmlEntitiesOnce(signed).includes('&_nc_ht='), true);
assert.strictEqual(h.decodeHtmlEntitiesOnce(signed).includes('a%253Dkeep%2525'), true, 'must not double decode nested values');
assert.strictEqual(h.isProgressiveHttpsUrl(signed), true);
assert.strictEqual(h.isProgressiveHttpsUrl('blob:https://www.instagram.com/abc'), false);
assert.throws(() => h.assertDownloadableUrl('blob:https://www.instagram.com/abc'), /Unsupported download URL protocol/);
const candidates = h.normalizeVideoCandidates([
  { url: 'https://cdn.example.com/low.mp4?x=1', width: 360, height: 640 },
  { url: 'https://cdn.example.com/high.mp4?x=1', width: 1080, height: 1920 },
  { url: 'https://cdn.example.com/high.mp4?x=1', width: 1080, height: 1920 },
  { url: 'https://cdn.example.com/dash.m4s?x=1', width: 4000, height: 4000 },
]);
assert.strictEqual(candidates.length, 2, 'dedupes and excludes dash fragments');
assert.strictEqual(candidates[0].url, 'https://cdn.example.com/high.mp4?x=1');

scripts.push({ textContent: '{"video_versions":[{"url":"https:\\/\\/cdn.example.com\\/progressive.mp4?sig=a%253D1\\u0026_nc_sid=x","width":720,"height":1280}],"video_dash_manifest":"<Representation>video-only</Representation>"}' });
(async () => {
  const resolved = await h.resolveVideoSource({ querySelectorAll: () => scripts, querySelector: () => null }, video, 'download');
  assert.strictEqual(resolved.sourceKind, 'progressive_https');
  assert.strictEqual(resolved.url, 'https://cdn.example.com/progressive.mp4?sig=a%253D1&_nc_sid=x');
  const item = await h.buildDownloadItemForSlide({ media: video }, { querySelectorAll: () => scripts, querySelector: () => null }, { username: 'user' }, '2026-07-20_00-00-00', 0, 1);
  assert.strictEqual(item.url.startsWith('https://'), true);
  console.log('download helper tests passed');
})().catch((error) => { console.error(error); process.exit(1); });
