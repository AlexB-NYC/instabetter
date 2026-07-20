class UnsupportedDownloadSourceError extends Error {
  constructor(message = 'Unsupported download source.') {
    super(message);
    this.name = 'UnsupportedDownloadSourceError';
    this.code = 'UNSUPPORTED_DOWNLOAD_SOURCE';
  }
}

function redactedUrlParts(url) {
  try {
    const parsed = new URL(url);
    return { protocol: parsed.protocol, host: parsed.host, path: parsed.pathname };
  } catch (error) {
    return { protocol: 'invalid', host: '', path: '' };
  }
}

function assertSupportedDownloadUrl(url) {
  let parsed;
  try { parsed = new URL(url); } catch (error) { throw new UnsupportedDownloadSourceError('Invalid download URL.'); }
  if (!['https:', 'data:'].includes(parsed.protocol)) throw new UnsupportedDownloadSourceError(`Unsupported download URL protocol: ${parsed.protocol}`);
  if (parsed.protocol === 'https:' && ['instagram.com', 'www.instagram.com'].includes(parsed.hostname)) throw new UnsupportedDownloadSourceError('INVALID_MEDIA_URL: Instagram page URLs cannot be downloaded as media.');
}

function waitForDownloadFinalState(downloadId) {
  return new Promise((resolve) => {
    const listener = (delta) => {
      if (delta.id !== downloadId) return;
      if (delta.state?.current === 'complete') {
        chrome.downloads.onChanged.removeListener(listener);
        resolve({ ok: true, downloadId, state: 'complete' });
      } else if (delta.state?.current === 'interrupted') {
        chrome.downloads.onChanged.removeListener(listener);
        resolve({ ok: false, downloadId, state: 'interrupted', error: delta.error?.current || 'UNKNOWN' });
      }
    };
    chrome.downloads.onChanged.addListener(listener);
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'igfs:download') return false;
  (async () => {
    try {
      assertSupportedDownloadUrl(message.url);
      chrome.downloads.download({ url: message.url, filename: message.filename, saveAs: false }, async (downloadId) => {
        const error = chrome.runtime.lastError;
        if (error) { sendResponse({ ok: false, error: error.message }); return; }
        const result = await waitForDownloadFinalState(downloadId);
        console.info('[IGFS]', 'download finished', { ...redactedUrlParts(message.url), sourceKind: message.sourceKind, downloadId, state: result.state, interruption: result.error });
        sendResponse(result);
      });
    } catch (error) {
      sendResponse({ ok: false, error: error.message, code: error.code || error.name });
    }
  })();
  return true;
});

if (typeof module !== 'undefined') module.exports = { UnsupportedDownloadSourceError, assertSupportedDownloadUrl, redactedUrlParts };
