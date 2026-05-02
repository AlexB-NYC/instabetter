(() => {
  const BUTTON_CLASS = 'igfs-toggle-btn';
  const HOST_CLASS = 'igfs-host';
  const LOG_PREFIX = '[IGFS]';
  let overlay = null;

  function describeNode(node) {
    if (!node) return 'null';
    const tag = node.tagName ? node.tagName.toLowerCase() : 'node';
    const id = node.id ? `#${node.id}` : '';
    const cls = node.classList && node.classList.length ? `.${[...node.classList].join('.')}` : '';
    return `${tag}${id}${cls}`;
  }

  function log(message, details = {}) {
    console.log(`${LOG_PREFIX} ${message}`, details);
  }

  function findMediaRoot(start) {
    log('findMediaRoot:start', { start: describeNode(start), startEl: start });

    const article = start.closest('article');
    if (article) {
      const media = article.querySelector('ul, div[role="button"]') || article;
      log('findMediaRoot:article match', {
        article: describeNode(article),
        mediaRoot: describeNode(media),
      });
      return media;
    }

    const dialog = start.closest('div[role="dialog"]');
    if (dialog) {
      const root = dialog.querySelector('section main') || dialog;
      log('findMediaRoot:dialog match', { dialog: describeNode(dialog), mediaRoot: describeNode(root) });
      return root;
    }

    log('findMediaRoot:none found');
    return null;
  }

  function getVisibleMedia(root) {
    const candidates = [...root.querySelectorAll('img, video')];
    log('getVisibleMedia:candidates found', {
      root: describeNode(root),
      candidateCount: candidates.length,
      candidates,
    });

    const visible = candidates.filter((el) => {
      const r = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const passes = r.width > 60 && r.height > 60 && style.visibility !== 'hidden' && style.display !== 'none';
      log('getVisibleMedia:candidate check', {
        candidate: describeNode(el),
        width: r.width,
        height: r.height,
        visibility: style.visibility,
        display: style.display,
        passes,
      });
      return passes;
    });

    const ordered = visible.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return (br.width * br.height) - (ar.width * ar.height);
    });

    const chosen = ordered[0] || null;
    log('getVisibleMedia:chosen', {
      visibleCount: visible.length,
      chosen: describeNode(chosen),
      chosenEl: chosen,
    });

    return chosen;
  }

  function closeOverlay(reason = 'unknown') {
    log('closeOverlay:requested', { reason, overlayExists: !!overlay });
    if (overlay) {
      overlay.remove();
      overlay = null;
      document.body.style.overflow = '';
      log('closeOverlay:removed', { bodyOverflow: document.body.style.overflow });
    }
  }

  function openOverlay(mediaEl) {
    log('openOverlay:start', {
      media: describeNode(mediaEl),
      mediaEl,
      src: mediaEl.currentSrc || mediaEl.src || null,
    });

    closeOverlay('openOverlay:reset before open');

    overlay = document.createElement('div');
    overlay.className = 'igfs-container';
    log('openOverlay:create overlay', { overlay: describeNode(overlay), overlayEl: overlay });

    const wrap = document.createElement('div');
    wrap.className = 'igfs-media-wrap';
    log('openOverlay:create wrap', { wrap: describeNode(wrap), wrapEl: wrap });

    const clone = mediaEl.cloneNode(true);
    clone.removeAttribute('style');
    log('openOverlay:clone media', {
      clone: describeNode(clone),
      cloneTag: clone.tagName,
      cloneSrc: clone.currentSrc || clone.src || null,
      cloneEl: clone,
    });

    if (clone.tagName === 'VIDEO') {
      clone.controls = true;
      clone.autoplay = true;
      clone.loop = true;
      clone.muted = false;
      clone.playsInline = true;
      log('openOverlay:video properties set', {
        controls: clone.controls,
        autoplay: clone.autoplay,
        loop: clone.loop,
        muted: clone.muted,
        playsInline: clone.playsInline,
      });
    }

    const close = document.createElement('button');
    close.className = 'igfs-close';
    close.type = 'button';
    close.setAttribute('aria-label', 'Close fullscreen view');
    close.textContent = '×';

    close.addEventListener('click', () => closeOverlay('close button click'));
    overlay.addEventListener('click', (e) => {
      log('openOverlay:overlay click', {
        target: describeNode(e.target),
        currentTarget: describeNode(e.currentTarget),
      });
      if (e.target === overlay) closeOverlay('overlay background click');
    });

    log('openOverlay:append clone into wrap', { parent: describeNode(wrap), child: describeNode(clone) });
    wrap.appendChild(clone);
    log('openOverlay:append wrap into overlay', { parent: describeNode(overlay), child: describeNode(wrap) });
    overlay.appendChild(wrap);
    log('openOverlay:append close into overlay', { parent: describeNode(overlay), child: describeNode(close) });
    overlay.appendChild(close);
    log('openOverlay:append overlay into body', { body: describeNode(document.body), child: describeNode(overlay) });
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    log('openOverlay:complete', {
      overlayInDom: document.body.contains(overlay),
      bodyOverflow: document.body.style.overflow,
    });
  }

  function addButton(host) {
    if (!host) {
      log('addButton:skip missing host');
      return;
    }
    if (host.querySelector(`.${BUTTON_CLASS}`)) {
      log('addButton:skip already exists', { host: describeNode(host) });
      return;
    }

    host.classList.add(HOST_CLASS);
    const btn = document.createElement('button');
    btn.className = BUTTON_CLASS;
    btn.type = 'button';
    btn.title = 'Fullscreen media';
    btn.setAttribute('aria-label', 'Open media in fullscreen');
    btn.textContent = '⛶';

    btn.addEventListener('click', (e) => {
      log('button:click received', {
        button: describeNode(btn),
        host: describeNode(host),
        eventTarget: describeNode(e.target),
      });
      e.preventDefault();
      e.stopPropagation();
      const root = findMediaRoot(btn);
      if (!root) {
        log('button:click aborted (no media root)');
        return;
      }
      const media = getVisibleMedia(root);
      if (!media) {
        log('button:click aborted (no visible media)', { root: describeNode(root), rootEl: root });
        return;
      }
      log('button:click openOverlay with media', { media: describeNode(media), mediaEl: media });
      openOverlay(media);
    });

    host.appendChild(btn);
    log('addButton:inserted', { host: describeNode(host), button: describeNode(btn), hostEl: host });
  }

  function scan(reason = 'manual') {
    const cards = document.querySelectorAll('article, div[role="dialog"]');
    log('scan:start', { reason, cardCount: cards.length });

    cards.forEach((card, index) => {
      const media = card.querySelector('img, video');
      if (!media) {
        log('scan:skip card without media', { index, card: describeNode(card) });
        return;
      }

      const host = media.closest('li, div[style], article, section') || card;
      log('scan:card host resolved', {
        index,
        card: describeNode(card),
        media: describeNode(media),
        host: describeNode(host),
      });
      addButton(host);
    });
  }

  const observer = new MutationObserver((mutations) => {
    log('mutationObserver:triggered', {
      mutationCount: mutations.length,
      mutations: mutations.map((m) => ({
        type: m.type,
        target: describeNode(m.target),
        addedNodes: m.addedNodes.length,
        removedNodes: m.removedNodes.length,
      })),
    });
    scan('mutation observer');
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  log('mutationObserver:started', { root: describeNode(document.documentElement) });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      log('keydown:escape pressed');
      closeOverlay('escape key');
    }
  });

  log('init:starting first scan');
  scan('initial');
})();
