(() => {
  const BUTTON_CLASS = 'igfs-toggle-btn';
  const HOST_CLASS = 'igfs-host';
  const CARD_SELECTOR = 'article, div[role="dialog"]';
  const OVERLAY_SELECTOR = '.igfs-container';
  const MIN_MEDIA_SIZE = 60;

  let overlay = null;
  let overlayState = null;
  const cardBindings = new WeakMap();
  const pendingCards = new Set();
  let scanFrame = 0;

  function isInOverlay(element) {
    return element instanceof Element && Boolean(element.closest(OVERLAY_SELECTOR));
  }

  function canonicalizeCard(card) {
    if (!(card instanceof Element) || isInOverlay(card)) return null;
    if (card.matches('div[role="dialog"]')) {
      const nestedArticle = card.querySelector(':scope article');
      if (nestedArticle) return nestedArticle;
    }
    return card;
  }

  function findCard(element) {
    return element instanceof Element ? canonicalizeCard(element.closest(CARD_SELECTOR)) : null;
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
      if (media.closest(`.${BUTTON_CLASS}, ${OVERLAY_SELECTOR}`)) return;

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
      if (card.contains(current) && !current.matches('main, section, body') && elementContainsRect(current, mediaRect)) {
        best = current;
      }
      if (current === card) break;
      current = current.parentElement;
    }

    return best || card;
  }

  function getCardButton(card) {
    const binding = cardBindings.get(card);
    if (binding?.button?.isConnected && card.contains(binding.button)) return binding.button;
    return [...card.querySelectorAll(`:scope .${BUTTON_CLASS}`)].find((button) => findCard(button) === card) || null;
  }

  function upsertButton(card, media) {
    const host = findButtonHost(media, card);
    if (!host) return;

    const existingButtons = [...card.querySelectorAll(`:scope .${BUTTON_CLASS}`)].filter((button) => findCard(button) === card);
    let btn = getCardButton(card);
    existingButtons.forEach((button) => {
      if (button !== btn) button.remove();
    });

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
        if (currentMedia) openOverlay(currentMedia, currentCard, btn);
      });
    }

    btn.dataset.igfsMediaTag = media.tagName.toLowerCase();

    if (btn.parentElement !== host) host.appendChild(btn);
    if (!host.classList.contains(HOST_CLASS)) host.classList.add(HOST_CLASS);
    if (window.getComputedStyle(host).position === 'static') host.style.position = 'relative';
    cardBindings.set(card, { button: btn, host });
  }

  function scanCard(card) {
    card = canonicalizeCard(card);
    if (!card?.isConnected) return;
    const binding = cardBindings.get(card);
    if (binding?.button && (!binding.button.isConnected || !card.contains(binding.button))) cardBindings.delete(card);
    const media = findBestMedia(card);
    if (media) upsertButton(card, media);
  }

  function scheduleCardScan(card) {
    card = canonicalizeCard(card);
    if (!card?.isConnected || isInOverlay(card)) return;
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
      if (mutation.target instanceof Element) {
        const targetCard = findCard(mutation.target);
        if (targetCard) cards.add(targetCard);
      }
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element) || isInOverlay(node) || node.classList.contains(BUTTON_CLASS)) return;

        const nearest = findCard(node);
        if (nearest) cards.add(nearest);
        if (node.matches(CARD_SELECTOR)) cards.add(canonicalizeCard(node));
        node.querySelectorAll(CARD_SELECTOR).forEach((card) => cards.add(canonicalizeCard(card)));

        if ((node.matches('img, video') || node.querySelector('img, video')) && mutation.target instanceof Element) {
          const targetCard = findCard(mutation.target);
          if (targetCard) cards.add(targetCard);
        }
      });
    });
    [...cards].forEach((card) => { if (!card) cards.delete(card); });
    return cards;
  }

  function restoreFocus() {
    const previousFocus = overlayState?.previousFocus;
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  }

  function pauseActiveVideo() {
    const video = overlayState?.activeMedia;
    if (video?.tagName === 'VIDEO') video.pause();
  }

  function closeOverlay() {
    if (!overlay) return;

    pauseActiveVideo();
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

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      renderSlide(overlayState.activeIndex - 1);
      return;
    }

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      renderSlide(overlayState.activeIndex + 1);
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

  function getPrimaryMedia(slide) {
    return slide.querySelector('video') || slide.querySelector('img');
  }

  function mediaSignature(media) {
    return [media.currentSrc, media.src, media.getAttribute('src'), media.getAttribute('poster'), media.getAttribute('alt')].join('|');
  }

  function findCarouselContainer(activeMedia, card) {
    const activeSlide = activeMedia.closest('li');
    const list = activeSlide?.parentElement;
    if (list?.tagName === 'UL' && card?.contains(list)) return list;
    return null;
  }

  function buildSlideModel(activeMedia, card) {
    const single = { media: activeMedia, alt: activeMedia.getAttribute('alt') || '' };
    const container = findCarouselContainer(activeMedia, card);
    if (!container) return { slides: [single], activeIndex: 0 };

    const items = [...container.children].filter((child) => child.tagName === 'LI');
    const slides = [];
    let activeIndex = -1;

    items.forEach((item) => {
      const media = getPrimaryMedia(item);
      if (!media || media.closest(`.${BUTTON_CLASS}, ${OVERLAY_SELECTOR}`)) return;
      if (media.tagName !== 'IMG' && media.tagName !== 'VIDEO') return;
      const slide = { media, alt: media.getAttribute('alt') || '' };
      if (item.contains(activeMedia) || media === activeMedia) activeIndex = slides.length;
      slides.push(slide);
    });

    if (slides.length < 2) return { slides: [single], activeIndex: 0 };
    if (activeIndex < 0) {
      const activeSig = mediaSignature(activeMedia);
      activeIndex = slides.findIndex((slide) => mediaSignature(slide.media) === activeSig);
    }
    if (activeIndex < 0) activeIndex = 0;
    return { slides, activeIndex: Math.min(activeIndex, slides.length - 1) };
  }

  function cloneSlideMedia(slide) {
    const clone = slide.media.cloneNode(true);
    clone.removeAttribute('style');
    clone.removeAttribute('id');
    clone.querySelectorAll?.('[id]').forEach((element) => element.removeAttribute('id'));
    if (slide.alt && clone.tagName === 'IMG') clone.alt = slide.alt;

    if (clone.tagName === 'VIDEO') {
      clone.controls = true;
      clone.autoplay = true;
      clone.loop = true;
      clone.muted = false;
      clone.playsInline = true;
    }

    clone.addEventListener('click', (e) => e.stopPropagation());
    return clone;
  }

  function updateCarouselControls() {
    const { slides, activeIndex, previousButton, nextButton, counter, liveStatus } = overlayState;
    const hasMultiple = slides.length > 1;
    previousButton.hidden = !hasMultiple;
    nextButton.hidden = !hasMultiple;
    counter.hidden = !hasMultiple;
    previousButton.disabled = activeIndex <= 0;
    nextButton.disabled = activeIndex >= slides.length - 1;
    const text = `${activeIndex + 1} of ${slides.length}`;
    counter.textContent = text;
    counter.setAttribute('aria-label', `Slide ${text}`);
    liveStatus.textContent = hasMultiple ? `Slide ${text}` : '';
  }

  function renderSlide(index) {
    if (!overlayState || index < 0 || index >= overlayState.slides.length) return;
    pauseActiveVideo();
    overlayState.activeIndex = index;
    overlayState.mediaWrap.replaceChildren(cloneSlideMedia(overlayState.slides[index]));
    overlayState.activeMedia = overlayState.mediaWrap.firstElementChild;
    updateCarouselControls();
  }

  function openOverlay(mediaEl, card, invokingButton) {
    closeOverlay();

    const slideModel = buildSlideModel(mediaEl, card || findCard(mediaEl));
    overlayState = {
      previousBodyOverflow: document.body.style.overflow,
      previousFocus: invokingButton || (document.activeElement instanceof HTMLElement ? document.activeElement : null),
      slides: slideModel.slides,
      activeIndex: slideModel.activeIndex,
      activeMedia: null,
    };

    overlay = document.createElement('div');
    overlay.className = 'igfs-container';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Fullscreen Instagram media');
    overlay.tabIndex = -1;

    const wrap = document.createElement('div');
    wrap.className = 'igfs-media-wrap';
    overlayState.mediaWrap = wrap;

    const previous = document.createElement('button');
    previous.className = 'igfs-carousel-btn igfs-carousel-prev';
    previous.type = 'button';
    previous.setAttribute('aria-label', 'Show previous slide');
    previous.textContent = '‹';
    previous.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      renderSlide(overlayState.activeIndex - 1);
    });

    const next = document.createElement('button');
    next.className = 'igfs-carousel-btn igfs-carousel-next';
    next.type = 'button';
    next.setAttribute('aria-label', 'Show next slide');
    next.textContent = '›';
    next.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      renderSlide(overlayState.activeIndex + 1);
    });

    const counter = document.createElement('div');
    counter.className = 'igfs-carousel-counter';

    const liveStatus = document.createElement('div');
    liveStatus.className = 'igfs-sr-only';
    liveStatus.setAttribute('aria-live', 'polite');

    const close = document.createElement('button');
    close.className = 'igfs-close';
    close.type = 'button';
    close.setAttribute('aria-label', 'Close fullscreen view');
    close.textContent = '×';

    overlayState.previousButton = previous;
    overlayState.nextButton = next;
    overlayState.counter = counter;
    overlayState.liveStatus = liveStatus;

    close.addEventListener('click', closeOverlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target === wrap) closeOverlay();
    });

    overlay.appendChild(wrap);
    overlay.appendChild(previous);
    overlay.appendChild(next);
    overlay.appendChild(counter);
    overlay.appendChild(liveStatus);
    overlay.appendChild(close);
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleOverlayKeydown, true);
    renderSlide(overlayState.activeIndex);
    close.focus({ preventScroll: true });
  }

  const observer = new MutationObserver((mutations) => {
    collectAffectedCards(mutations).forEach(scheduleCardScan);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  document.querySelectorAll(CARD_SELECTOR).forEach(scheduleCardScan);
})();
