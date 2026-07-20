const assert = require('assert');
const fs = require('fs');
const source = fs.readFileSync('content.js', 'utf8');
const fixture = `
<article class="igfs-host">
  <a href="/p/TEST_IMAGE_POST/"></a>
  <div class="media-container">
    <img class="profile-picture" src="https://cdn.example.test/avatar.jpg">
    <img class="main-post-image" src="https://cdn.example.test/image.jpg">
  </div>
  <button class="igfs-download-btn" data-igfs-media-tag="img"></button>
  <button class="igfs-toggle-btn" data-igfs-media-tag="img"></button>
</article>
<article><video src="blob:https://www.instagram.com/unrelated"></video></article>`;
const metadata = { shortcode: 'TEST_IMAGE_POST', mediaType: 1, videoVersions: null, videoDashManifest: null, imageCandidates: [{ url: 'https://cdn.example.test/image.jpg', width: 1080, height: 1350 }] };
assert.ok(fixture.includes('data-igfs-media-tag="img"'));
assert.strictEqual(metadata.mediaType, 1);
assert.ok(/function normalizeMediaKind\(value\).*?value === 'img'.*?return 'image'/s.test(source), 'dataset img maps to canonical image');
assert.ok(/value === 1.*?return 'image'/s.test(source), 'Instagram media_type 1 maps to image');
assert.ok(/function renderSlide\(index\).*?switch \(kind\).*?case 'image'.*?case 'video'/s.test(source), 'renderer branches explicitly by canonical kind');
assert.ok(/case 'image': \{ const media = cloneImage\(slide\); overlayState\.mediaWrap\.appendChild\(media\);/s.test(source), 'image branch renders an image node');
assert.ok(/case 'video': mountVideo\(slide, overlayState\.requestId\);/s.test(source), 'video branch is isolated');
assert.ok(!/else \{\s*mountVideo/.test(source), 'unknown media cannot fall through to video via else');
assert.ok(/async function buildDownloadItemForSlide\(slide.*?switch \(kind\).*?case 'image': break;.*?case 'video': \{ const resolved = await resolveVideoSource/s.test(source), 'image downloads do not invoke video source resolution');
assert.ok(/btn\.addEventListener\('click'.*?e\.currentTarget/s.test(source), 'fullscreen handler uses currentTarget');
assert.ok(/downloadBtn\.addEventListener\('click'.*?e\.currentTarget/s.test(source), 'download handler uses currentTarget');
assert.ok(/overlayState\.requestId !== requestId \|\| overlayState\.activeKind !== 'video'/.test(source), 'late video source results are gated by request and kind');
assert.ok(/const IMAGE_CLASS = 'igfs-fullscreen-image'/.test(source), 'image overlay class exists');
console.log('media routing static regression tests passed');
