(() => {
  const BUTTON_CLASS = 'igfs-toggle-btn';
  const HOST_CLASS = 'igfs-host';
  let overlay = null;

  function findMediaRoot(start) {
    const article = start.closest('article');
    if (article) {
      const media = article.querySelector('ul, div[role="button"]') || article;
      return media;
    }

    const dialog = start.closest('div[role="dialog"]');
    if (dialog) {
      return dialog.querySelector('section main') || dialog;
    }

    return null;
  }

  function getVisibleMedia(root) {
    const candidates = [...root.querySelectorAll('img, video')];
    const visible = candidates.filter((el) => {
      const r = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return r.width > 60 && r.height > 60 && style.visibility !== 'hidden' && style.display !== 'none';
    });

    const ordered = visible.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return (br.width * br.height) - (ar.width * ar.height);
    });

    return ordered[0] || null;
  }

  function closeOverlay() {
    if (overlay) {
      overlay.remove();
      overlay = null;
      document.body.style.overflow = '';
    }
  }

  function openOverlay(mediaEl) {
    closeOverlay();

    overlay = document.createElement('div');
    overlay.className = 'igfs-container';

    const wrap = document.createElement('div');
    wrap.className = 'igfs-media-wrap';

    const clone = mediaEl.cloneNode(true);
    clone.removeAttribute('style');

    if (clone.tagName === 'VIDEO') {
      clone.controls = true;
      clone.autoplay = true;
      clone.loop = true;
      clone.muted = false;
      clone.playsInline = true;
    }

    const close = document.createElement('button');
    close.className = 'igfs-close';
    close.type = 'button';
    close.setAttribute('aria-label', 'Close fullscreen view');
    close.textContent = '×';

    close.addEventListener('click', closeOverlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeOverlay();
    });

    wrap.appendChild(clone);
    overlay.appendChild(wrap);
    overlay.appendChild(close);
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
  }

  function addButton(host) {
    if (!host || host.querySelector(`.${BUTTON_CLASS}`)) return;

    host.classList.add(HOST_CLASS);
    const btn = document.createElement('button');
    btn.className = BUTTON_CLASS;
    btn.type = 'button';
    btn.title = 'Fullscreen media';
    btn.setAttribute('aria-label', 'Open media in fullscreen');
    btn.textContent = '⛶';

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const root = findMediaRoot(btn);
      if (!root) return;
      const media = getVisibleMedia(root);
      if (media) openOverlay(media);
    });

    host.appendChild(btn);
  }

  function scan() {
    const cards = document.querySelectorAll('article, div[role="dialog"]');
    cards.forEach((card) => {
      const media = card.querySelector('img, video');
      if (!media) return;

      const host = media.closest('li, div[style], article, section') || card;
      addButton(host);
    });
  }

  const observer = new MutationObserver(() => scan());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeOverlay();
  });

  scan();
})();
