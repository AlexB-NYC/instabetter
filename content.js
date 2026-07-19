(() => {
  const BUTTON_CLASS = 'igfs-toggle-btn';
  const HOST_CLASS = 'igfs-host';
  const CARD_SELECTOR = 'article, div[role="dialog"]';
  const MIN_MEDIA_SIZE = 60;

  let overlay = null;
  let overlayState = null;
  const pendingCards = new Set();
  let scanFrame = 0;

  function findCard(element) {
    return element instanceof Element ? element.closest(CARD_SELECTOR) : null;
  }

  function rectIntersection(a, b) {
    const left = Math.max(a.left, b.left);
    const right = Math.min(a.right, b.right);
    const top = Math.max(a.top, b.top);
    const bottom = Math.min(a.bottom, b.bottom);
    const width = Math.max(0, right - left);
    const height = Math.max(0, bottom - top);
    return { width, height, area: width * height, centerX: left + width / 2, centerY: top + height / 2 };
  }

  function getVisibleIntersectionArea(element, bounds) {
    if (!element.isConnected) return 0;

    const rect = element.getBoundingClientRect();
    if (rect.width < MIN_MEDIA_SIZE || rect.height < MIN_MEDIA_SIZE) return 0;

    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < 0.05) return 0;

    const viewport = {
      left: 0,
      top: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
    };
    const viewportIntersection = rectIntersection(rect, viewport);
    if (!viewportIntersection.area) return 0;

    return rectIntersection(rect, bounds).area;
  }

  function findBestMedia(card) {
    if (!card?.isConnected) return null;

    const cardRect = card.getBoundingClientRect();
    const cardVisibleArea = rectIntersection(cardRect, {
      left: 0,
      top: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
    }).area;
    if (!cardVisibleArea) return null;

    const cardCenterX = cardRect.left + cardRect.width / 2;
    const cardCenterY = cardRect.top + cardRect.height / 2;
    let best = null;

    card.querySelectorAll('img, video').forEach((media) => {
      if (media.closest(`.${BUTTON_CLASS}, .igfs-container`)) return;

      const area = getVisibleIntersectionArea(media, cardRect);
      if (!area) return;

      const rect = media.getBoundingClientRect();
      const mediaCenterX = rect.left + rect.width / 2;
      const mediaCenterY = rect.top + rect.height / 2;
      const centerDistance = Math.hypot(mediaCenterX - cardCenterX, mediaCenterY - cardCenterY);
      const score = { media, area, centerDistance };

      if (!best || score.area > best.area || (score.area === best.area && score.centerDistance < best.centerDistance)) {
        best = score;
      }
    });

    return best?.media || null;
  }

  function elementContainsRect(element, innerRect) {
    const rect = element.getBoundingClientRect();
    return rect.left <= innerRect.left + 1
      && rect.top <= innerRect.top + 1
      && rect.right >= innerRect.right - 1
      && rect.bottom >= innerRect.bottom - 1;
  }

  function findButtonHost(media, card) {
    const mediaRect = media.getBoundingClientRect();
    let current = media.parentElement;
    let best = media.parentElement;

    while (current && current !== card.parentElement) {
      if (card.contains(current) && elementContainsRect(current, mediaRect)) {
        best = current;
      }
      if (current === card) break;
      current = current.parentElement;
    }

    return best || card;
  }

  function getCardButton(card) {
    return card.querySelector(`:scope .${BUTTON_CLASS}`);
  }

  function upsertButton(card, media) {
    const host = findButtonHost(media, card);
    if (!host) return;

    let btn = getCardButton(card);
    if (!btn) {
      btn = document.createElement('button');
      btn.className = BUTTON_CLASS;
      btn.type = 'button';
      btn.title = 'Fullscreen media';
      btn.setAttribute('aria-label', 'Open media in fullscreen');
      btn.textContent = '⛶';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const currentCard = findCard(btn);
        const currentMedia = currentCard ? findBestMedia(currentCard) : null;
        if (currentMedia) openOverlay(currentMedia);
      });
    }

    btn.dataset.igfsMediaTag = media.tagName.toLowerCase();

    if (btn.parentElement !== host) host.appendChild(btn);
    if (!host.classList.contains(HOST_CLASS)) host.classList.add(HOST_CLASS);
    if (window.getComputedStyle(host).position === 'static') host.style.position = 'relative';
  }

  function scanCard(card) {
    if (!card?.isConnected) return;
    const media = findBestMedia(card);
    if (media) upsertButton(card, media);
  }

  function scheduleCardScan(card) {
    if (!card?.isConnected || card.closest('.igfs-container')) return;
    pendingCards.add(card);
    if (scanFrame) return;
    scanFrame = requestAnimationFrame(() => {
      scanFrame = 0;
      const cards = [...pendingCards];
      pendingCards.clear();
      cards.forEach(scanCard);
    });
  }

  function collectAffectedCards(mutations) {
    const cards = new Set();
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element) || node.closest('.igfs-container') || node.classList.contains(BUTTON_CLASS)) return;

        const nearest = findCard(node);
        if (nearest) cards.add(nearest);
        if (node.matches(CARD_SELECTOR)) cards.add(node);
        node.querySelectorAll(CARD_SELECTOR).forEach((card) => cards.add(card));

        if ((node.matches('img, video') || node.querySelector('img, video')) && mutation.target instanceof Element) {
          const targetCard = findCard(mutation.target);
          if (targetCard) cards.add(targetCard);
        }
      });
    });
    return cards;
  }

  function restoreFocus() {
    const previousFocus = overlayState?.previousFocus;
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  }

  function closeOverlay() {
    if (!overlay) return;

    const video = overlay.querySelector('video');
    if (video) video.pause();

    document.removeEventListener('keydown', handleOverlayKeydown, true);
    overlay.remove();
    overlay = null;

    if (overlayState) {
      document.body.style.overflow = overlayState.previousBodyOverflow;
      restoreFocus();
      overlayState = null;
    }
  }

  function getFocusableOverlayElements() {
    if (!overlay) return [];
    return [...overlay.querySelectorAll('button, [href], input, select, textarea, video[controls], [tabindex]:not([tabindex="-1"])')]
      .filter((element) => !element.disabled && element.getAttribute('aria-hidden') !== 'true');
  }

  function handleOverlayKeydown(e) {
    if (!overlay) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      closeOverlay();
      return;
    }

    if (e.key !== 'Tab') return;

    const focusable = getFocusableOverlayElements();
    if (!focusable.length) {
      e.preventDefault();
      overlay.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function openOverlay(mediaEl) {
    closeOverlay();

    overlayState = {
      previousBodyOverflow: document.body.style.overflow,
      previousFocus: document.activeElement instanceof HTMLElement ? document.activeElement : null,
    };

    overlay = document.createElement('div');
    overlay.className = 'igfs-container';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Fullscreen Instagram media');
    overlay.tabIndex = -1;

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
      if (e.target === overlay || e.target === wrap) closeOverlay();
    });

    clone.addEventListener('click', (e) => e.stopPropagation());

    wrap.appendChild(clone);
    overlay.appendChild(wrap);
    overlay.appendChild(close);
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleOverlayKeydown, true);
    close.focus({ preventScroll: true });
  }

  const observer = new MutationObserver((mutations) => {
    collectAffectedCards(mutations).forEach(scheduleCardScan);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  document.querySelectorAll(CARD_SELECTOR).forEach(scheduleCardScan);
})();
