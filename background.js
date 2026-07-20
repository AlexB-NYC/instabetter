chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'igfs:download') return false;

  chrome.downloads.download({
    url: message.url,
    filename: message.filename,
    saveAs: false
  }, (downloadId) => {
    const error = chrome.runtime.lastError;
    if (error) sendResponse({ ok: false, error: error.message });
    else sendResponse({ ok: true, downloadId });
  });

  return true;
});
