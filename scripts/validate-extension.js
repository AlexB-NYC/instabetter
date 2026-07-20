const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const extensionDir = path.resolve(ROOT, process.argv[2] || 'dist');
const manifestPath = path.join(extensionDir, 'manifest.json');

function fail(message) {
  throw new Error(message);
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`${label} must be a non-empty string`);
  }
}

function assertLocalFileExists(relativePath, label) {
  assertNonEmptyString(relativePath, label);
  if (/^[a-z][a-z0-9+.-]*:/i.test(relativePath) || relativePath.startsWith('//')) return;
  const resolved = path.resolve(extensionDir, relativePath);
  if (!resolved.startsWith(extensionDir + path.sep) && resolved !== extensionDir) {
    fail(`${label} escapes the extension directory: ${relativePath}`);
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    fail(`${label} references a missing file: ${relativePath}`);
  }
}

if (!fs.existsSync(manifestPath)) fail(`Missing manifest at ${manifestPath}`);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

if (![2, 3].includes(manifest.manifest_version)) {
  fail(`Unsupported manifest_version: ${manifest.manifest_version}`);
}

if (manifest.background) {
  if (manifest.manifest_version === 3) {
    if ('scripts' in manifest.background) {
      fail('Manifest V3 background must not use background.scripts');
    }
    assertLocalFileExists(manifest.background.service_worker, 'background.service_worker');
    if (manifest.background.type && !['module'].includes(manifest.background.type)) {
      fail(`Unsupported background.type: ${manifest.background.type}`);
    }
  } else if (Array.isArray(manifest.background.scripts)) {
    if (!manifest.background.scripts.length) fail('background.scripts must not be empty');
    manifest.background.scripts.forEach((script, index) => assertLocalFileExists(script, `background.scripts[${index}]`));
  }
}

for (const [scriptIndex, contentScript] of (manifest.content_scripts || []).entries()) {
  for (const [jsIndex, script] of (contentScript.js || []).entries()) {
    assertLocalFileExists(script, `content_scripts[${scriptIndex}].js[${jsIndex}]`);
  }
  for (const [cssIndex, css] of (contentScript.css || []).entries()) {
    assertLocalFileExists(css, `content_scripts[${scriptIndex}].css[${cssIndex}]`);
  }
}

for (const [size, icon] of Object.entries(manifest.icons || {})) {
  assertLocalFileExists(icon, `icons.${size}`);
}

for (const [resourceIndex, resourceSet] of (manifest.web_accessible_resources || []).entries()) {
  for (const [entryIndex, resource] of (resourceSet.resources || []).entries()) {
    assertLocalFileExists(resource, `web_accessible_resources[${resourceIndex}].resources[${entryIndex}]`);
  }
}

const backgroundPath = manifest.background?.service_worker || (manifest.background?.scripts || []).join(', ') || 'none';
console.log(`Validated ${path.relative(ROOT, extensionDir)} (manifest_version=${manifest.manifest_version}, background=${backgroundPath})`);
