const assert = require('assert');
const fs = require('fs');
const source = fs.readFileSync('content.js', 'utf8');
const sanitizedFixture = `
<article class="igfs-host">
  <a href="/p/TEST_VIDEO_POST/"></a>
  <div class="instagram-player-root">
    <div class="instagram-player-wrapper">
      <video class="instagram-video" playsinline preload="none" src="blob:https://www.instagram.test/test-blob"></video>
    </div>
  </div>
  <button class="igfs-toggle-btn" data-igfs-media-kind="video">Fullscreen</button>
</article>`;
const normalizedMediaRecord = { shortcode: 'TEST_VIDEO_POST', mediaType: 'video', progressiveVideoCandidates: [{ url: 'https://video.cdn.example.test/video.mp4?signed=test', width: 720, height: 1280 }] };
assert.ok(sanitizedFixture.includes('instagram-player-wrapper'));
assert.strictEqual(normalizedMediaRecord.progressiveVideoCandidates[0].url.startsWith('https://'), true);
assert.ok(/video_render_strategy: mediaEl\.tagName === 'VIDEO' \? 'progressive-player'/.test(source), 'progressive HTTPS player is announced as default video strategy');
assert.ok(/renderStrategy: 'progressive-player'/.test(source), 'clean progressive player record exists');
assert.ok(/document\.createElement\('video'\).*?video\.className = VIDEO_CLASS/s.test(source), 'progressive path creates extension-owned video');
assert.ok(/video\.preload = 'auto'/.test(source), 'clean player preloads automatically');
assert.ok(/video\.src = resolved\.url/.test(source), 'clean player uses resolved progressive URL');
assert.ok(!/appendChild\(sourceVideo\)/.test(source), 'source Instagram video is never appended to overlay');
assert.ok(!/replaceChildren\(sourceVideo\)/.test(source), 'source Instagram video is never replaceChildren-reparented');
assert.ok(!/insertBefore\(video, record/.test(source), 'teardown does not insert/reparent original video');
assert.ok(/renderStrategy: 'original-node-in-place'/.test(source), 'original-node fallback is explicitly in-place');
assert.ok(/sourceVideo\.parentElement/.test(source) && /assertOriginalNodeInPlace/.test(source), 'original parent invariant is recorded and asserted');
assert.ok(/!overlay\?\.contains\(video\)/.test(source), 'overlay containment invariant is asserted');
assert.ok(/verifyPlaybackProgress/.test(source), 'playback verification helper exists');
assert.ok(/frames >= 2 && advanced >= 0\.25/.test(source), 'stable playback requires multiple frames and time advancement');
assert.ok(/unexpected-pause/.test(source), 'delayed pauses are classified as unexpected');
assert.ok(/NotAllowedError/.test(source) && /defaultMuted = true/.test(source), 'autoplay muted retry is preserved');
assert.ok(/pauseVideo\(video, reason\)/.test(source), 'fullscreen pauses are routed through a reasoned helper');
assert.ok(/const shouldLog = isDebug\(\) \|\| isInitial/.test(source), 'routine scan updates are debug-only');
assert.ok(!/setInterval\(\(\) => video\.play/.test(source), 'no keepalive replay interval is used');
console.log('fullscreen playback static regression tests passed');
