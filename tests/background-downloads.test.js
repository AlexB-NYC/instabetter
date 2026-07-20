const assert = require('assert');
let listener;
global.chrome = { runtime: { onMessage: { addListener: (fn) => { listener = fn; } }, lastError: null }, downloads: { onChanged: { addListener: (fn) => { global._changed = fn; }, removeListener: () => {} }, download: (opts, cb) => { global._downloadOpts = opts; cb(42); setImmediate(() => global._changed({ id: 42, state: { current: 'complete' } })); } } };
const bg = require('../background.js');
assert.throws(() => bg.assertSupportedDownloadUrl('blob:https://www.instagram.com/a'), /Unsupported/);
assert.doesNotThrow(() => bg.assertSupportedDownloadUrl('https://cdn.example.com/a.mp4?sig=a%253D1'));
assert.throws(() => bg.assertSupportedDownloadUrl('https://www.instagram.com/'), /INVALID_MEDIA_URL/);
new Promise((resolve) => listener({ type: 'igfs:download', url: 'https://cdn.example.com/a.mp4?sig=a%253D1', filename: 'a.mp4' }, {}, resolve)).then((res) => {
  assert.deepStrictEqual({ ok: res.ok, state: res.state, id: res.downloadId }, { ok: true, state: 'complete', id: 42 });
  assert.strictEqual(global._downloadOpts.url, 'https://cdn.example.com/a.mp4?sig=a%253D1');
  console.log('background download tests passed');
}).catch((e) => { console.error(e); process.exit(1); });
