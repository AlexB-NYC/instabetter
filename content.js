(() => {
  const BUTTON_CLASS = 'igfs-toggle-btn';
  const HOST_CLASS = 'igfs-host';
  const CARD_SELECTOR = 'article, div[role="dialog"]';
  const OVERLAY_SELECTOR = '.igfs-container';
  const MIN_MEDIA_SIZE = 60;
  const LOG_PREFIX = '[IGFS]';
  const LOG_LEVEL_KEY = 'igfs:log-level';
  const MAX_SCAN_ROWS = 25;
  const MAX_SNAPSHOT_ROWS = 50;
  const MAX_CANDIDATE_ROWS = 15;

  let overlay = null;
  let overlayState = null;
  const cardBindings = new WeakMap();
  const cardIds = new WeakMap();
  const lastFingerprints = new WeakMap();
  const pendingCards = new Map();
  let nextCardId = 1;
  let scanFrame = 0;
  let initialFlushPending = true;

  function getLogLevel() {
    try {
      const level = sessionStorage.getItem(LOG_LEVEL_KEY);
      return ['info', 'debug', 'off'].includes(level) ? level : 'info';
    } catch (error) {
      return 'info';
    }
  }

  const diagnostics = { level: getLogLevel(), mutation: null };
  const isDebug = () => diagnostics.level === 'debug';
  const isInfo = () => diagnostics.level === 'info' || diagnostics.level === 'debug';
  const logInfo = (...args) => { if (isInfo()) console.info(LOG_PREFIX, ...args); };
  const logDebug = (...args) => { if (isDebug()) console.debug(LOG_PREFIX, ...args); };
  const logError = (operation, card, error) => console.error(LOG_PREFIX, `${operation} failed`, { card_id: card ? getCardId(card) : undefined, error });

  function getCardId(card) {
    if (!cardIds.has(card)) cardIds.set(card, `card-${nextCardId++}`);
    return cardIds.get(card);
  }

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

  function getCardType(card) {
    if (card?.matches?.('article')) return 'article';
    if (card?.matches?.('div[role="dialog"]')) return 'dialog';
    return card?.tagName?.toLowerCase() || 'unknown';
  }

  function getPostPath(card) {
    const link = card?.querySelector?.('a[href^="/p/"], a[href^="/reel/"]');
    if (!link) return '';
    try { return new URL(link.getAttribute('href'), location.origin).pathname; } catch (error) { return ''; }
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

  function evaluateMedia(card) {
    const viewport = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    const cardRect = card.getBoundingClientRect();
    const cardViewportArea = rectIntersection(cardRect, viewport).area;
    const mediaElements = [...card.querySelectorAll('img, video')];
    const rejectionCounts = {};
    const candidates = [];
    let best = null;

    const addRejection = (reason) => { rejectionCounts[reason] = (rejectionCounts[reason] || 0) + 1; };

    if (!cardViewportArea) {
      mediaElements.forEach((media) => candidates.push({ tag: media.tagName.toLowerCase(), rejection_reason: 'card-outside-viewport' }));
      return { media: null, card_metrics: metricsFromRect(cardRect, cardViewportArea), candidate_counts: countMedia(mediaElements, 0), rejection_counts: rejectionCounts, outcome_reason: 'card-outside-viewport', candidates };
    }

    const cardCenterX = cardRect.left + cardRect.width / 2;
    const cardCenterY = cardRect.top + cardRect.height / 2;
    mediaElements.forEach((media) => {
      const row = { tag: media.tagName.toLowerCase() };
      let reason = '';
      if (media.closest(`.${BUTTON_CLASS}, ${OVERLAY_SELECTOR}`)) reason = 'extension-ui';
      else if (!media.isConnected) reason = 'disconnected';

      const rect = media.getBoundingClientRect();
      row.width = Math.round(rect.width); row.height = Math.round(rect.height); row.top = Math.round(rect.top); row.bottom = Math.round(rect.bottom);
      if (!reason && (rect.width < MIN_MEDIA_SIZE || rect.height < MIN_MEDIA_SIZE)) reason = 'below-minimum-size';
      const style = window.getComputedStyle(media);
      row.display = style.display; row.visibility = style.visibility; row.opacity = Number(style.opacity).toFixed(2);
      if (!reason && style.display === 'none') reason = 'display-none';
      if (!reason && style.visibility === 'hidden') reason = 'visibility-hidden';
      if (!reason && Number(style.opacity) < 0.05) reason = 'opacity-too-low';
      const viewportIntersection = rectIntersection(rect, viewport);
      row.viewport_intersection_area = Math.round(viewportIntersection.area);
      if (!reason && !viewportIntersection.area) reason = 'outside-viewport';
      const cardArea = rectIntersection(rect, cardRect).area;
      if (!reason && !cardArea) reason = 'outside-card';
      row.rejection_reason = reason || '';
      candidates.push(row);
      if (reason) { addRejection(reason); return; }

      const mediaCenterX = rect.left + rect.width / 2;
      const mediaCenterY = rect.top + rect.height / 2;
      const score = { media, area: cardArea, centerDistance: Math.hypot(mediaCenterX - cardCenterX, mediaCenterY - cardCenterY) };
      if (!best || score.area > best.area || (score.area === best.area && score.centerDistance < best.centerDistance)) best = score;
    });

    const eligible = candidates.filter((candidate) => !candidate.rejection_reason).length;
    return {
      media: best?.media || null,
      card_metrics: metricsFromRect(cardRect, cardViewportArea),
      candidate_counts: countMedia(mediaElements, eligible),
      rejection_counts: rejectionCounts,
      outcome_reason: best ? 'media-selected' : (mediaElements.length ? 'no-eligible-media' : 'no-media-elements'),
      candidates,
    };
  }

  function metricsFromRect(rect, viewportArea) {
    return { width: Math.round(rect.width), height: Math.round(rect.height), top: Math.round(rect.top), bottom: Math.round(rect.bottom), viewport_area: Math.round(viewportArea) };
  }

  function countMedia(mediaElements, eligible) {
    return { images: mediaElements.filter((media) => media.tagName === 'IMG').length, videos: mediaElements.filter((media) => media.tagName === 'VIDEO').length, eligible };
  }

  function findBestMedia(card) { return card?.isConnected ? evaluateMedia(card).media : null; }

  function elementContainsRect(element, innerRect) {
    const rect = element.getBoundingClientRect();
    return rect.left <= innerRect.left + 1 && rect.top <= innerRect.top + 1 && rect.right >= innerRect.right - 1 && rect.bottom >= innerRect.bottom - 1;
  }

  function findButtonHost(media, card) {
    const mediaRect = media.getBoundingClientRect();
    let current = media.parentElement;
    let best = media.parentElement;
    while (current && current !== card.parentElement) {
      if (card.contains(current) && !current.matches('main, section, body') && elementContainsRect(current, mediaRect)) best = current;
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
    if (!host) return { action: 'failed', host: null, duplicateCount: 0 };
    const binding = cardBindings.get(card);
    const hadStaleBinding = Boolean(binding?.button && (!binding.button.isConnected || !card.contains(binding.button)));
    const existingButtons = [...card.querySelectorAll(`:scope .${BUTTON_CLASS}`)].filter((button) => findCard(button) === card);
    let btn = getCardButton(card);
    let duplicateCount = 0;
    existingButtons.forEach((button) => { if (button !== btn) { button.remove(); duplicateCount += 1; } });
    let action = btn ? 'retained' : 'inserted';
    const previousHost = btn?.parentElement || null;

    if (!btn) {
      btn = document.createElement('button');
      btn.className = BUTTON_CLASS;
      btn.type = 'button';
      btn.title = 'Fullscreen media';
      btn.setAttribute('aria-label', 'Open media in fullscreen');
      btn.textContent = '⛶';
      btn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const currentCard = findCard(btn);
        const currentMedia = currentCard ? findBestMedia(currentCard) : null;
        if (currentMedia) logButtonActivation(currentCard, currentMedia);
        if (currentMedia) openOverlay(currentMedia, currentCard, btn, 'replacement');
      });
    }

    btn.dataset.igfsMediaTag = media.tagName.toLowerCase();
    if (btn.parentElement !== host) {
      host.appendChild(btn);
      if (action !== 'inserted') action = previousHost ? 'moved' : 'rebound';
    }
    if (duplicateCount) action = action === 'retained' ? 'duplicate-buttons-removed' : action;
    if (hadStaleBinding && action === 'inserted') action = 'stale-binding-cleared+inserted';
    if (!host.classList.contains(HOST_CLASS)) host.classList.add(HOST_CLASS);
    if (window.getComputedStyle(host).position === 'static') host.style.position = 'relative';
    cardBindings.set(card, { button: btn, host });
    return { action, host, duplicateCount };
  }

  function scanCard(card, source = 'unknown', options = {}) {
    const canonical = canonicalizeCard(card);
    if (!canonical) return makeResult(card, source, 'skipped', isInOverlay(card) ? 'card-inside-extension-overlay' : 'noncanonical-card');
    card = canonical;
    try {
      if (!card.isConnected) return makeResult(card, source, 'skipped', 'card-disconnected');
      const binding = cardBindings.get(card);
      let staleCleared = false;
      if (!options.dryRun && binding?.button && (!binding.button.isConnected || !card.contains(binding.button))) { cardBindings.delete(card); staleCleared = true; }
      const evaluation = evaluateMedia(card);
      if (!evaluation.media) return makeResult(card, source, 'skipped', evaluation.outcome_reason, evaluation, null, staleCleared ? 'stale-binding-cleared' : 'skipped');
      const bindingResult = options.dryRun ? { action: getCardButton(card) ? 'retained' : 'skipped', host: findButtonHost(evaluation.media, card), duplicateCount: 0 } : upsertButton(card, evaluation.media);
      return makeResult(card, source, 'bound', 'media-selected', evaluation, bindingResult.host, bindingResult.action);
    } catch (error) {
      logError('scanCard', card, error);
      return makeResult(card, source, 'error', 'unexpected-error', null, null, 'failed', error);
    }
  }

  function makeResult(card, source, status, reason, evaluation = null, host = null, buttonAction = 'skipped', error = null) {
    const actualCard = card instanceof Element ? card : null;
    return { card, card_id: actualCard ? getCardId(actualCard) : '', post_path: actualCard ? getPostPath(actualCard) : '', card_type: actualCard ? getCardType(actualCard) : '', source, status, reason, connected: Boolean(actualCard?.isConnected), media_summary: evaluation, host_summary: host ? { tag: host.tagName.toLowerCase() } : null, button_action: buttonAction, error };
  }

  function resultRow(result) {
    const metrics = result.media_summary?.card_metrics || {};
    const counts = result.media_summary?.candidate_counts || {};
    return { card_id: result.card_id, post_path: result.post_path || result.card_id, card_type: result.card_type, source: result.source, status: result.status, reason: result.reason, connected: result.connected, card_width: metrics.width, card_height: metrics.height, card_top: metrics.top, card_bottom: metrics.bottom, card_viewport_area: metrics.viewport_area, image_count: counts.images || 0, video_count: counts.videos || 0, eligible_candidate_count: counts.eligible || 0, selected_media_tag: result.media_summary?.media?.tagName?.toLowerCase() || '', host_tag: result.host_summary?.tag || '', button_action: result.button_action };
  }

  function fingerprint(result) { return JSON.stringify(resultRow(result)); }

  function flushScans() {
    scanFrame = 0;
    const entries = [...pendingCards.entries()];
    pendingCards.clear();
    const isInitial = initialFlushPending;
    initialFlushPending = false;
    const results = entries.map(([card, sources]) => scanCard(card, [...sources].join(',')));
    logScanFlush(results, isInitial, diagnostics.mutation);
    diagnostics.mutation = null;
  }

  function logScanFlush(results, isInitial, mutationSummary) {
    if (!results.length) return;
    const changed = results.filter((result) => { const fp = fingerprint(result); const was = lastFingerprints.get(result.card); if (was !== fp) { lastFingerprints.set(result.card, fp); return true; } return false; });
    const rows = (isDebug() ? results : changed).map(resultRow);
    const shouldLog = isDebug() || isInitial || changed.length > 0;
    if (!shouldLog || !isInfo()) return;
    const summary = summarizeResults(results);
    console.groupCollapsed(`${LOG_PREFIX} scan flush ${isInitial ? 'initial' : 'update'}: ${results.length} processed, ${summary.bound} bound, ${summary.skipped} skipped`);
    console.info('summary', summary);
    if (mutationSummary && isDebug()) console.debug('mutation_batch', mutationSummary);
    console.table(rows.slice(0, MAX_SCAN_ROWS));
    if (rows.length > MAX_SCAN_ROWS) console.info(`${rows.length - MAX_SCAN_ROWS} additional rows omitted`);
    if (isDebug()) logDebugDetails(changed);
    console.groupEnd();
  }

  function summarizeResults(results) {
    return { trigger_sources: [...new Set(results.flatMap((result) => result.source.split(',')))].filter(Boolean).join(','), cards_processed: results.length, buttons_inserted: results.filter((r) => r.button_action.includes('inserted')).length, existing_bindings_retained: results.filter((r) => r.button_action === 'retained').length, buttons_moved_or_rebound: results.filter((r) => ['moved', 'rebound'].includes(r.button_action)).length, stale_bindings_cleared: results.filter((r) => r.button_action.includes('stale-binding-cleared')).length, cards_skipped: results.filter((r) => r.status === 'skipped').length, errors: results.filter((r) => r.status === 'error').length, bound: results.filter((r) => r.status === 'bound').length, skipped: results.filter((r) => r.status === 'skipped').length };
  }

  function logDebugDetails(results) {
    results.forEach((result) => {
      console.groupCollapsed(`${result.card_id} candidate diagnostics`);
      console.debug({ card: result.card, selected_media: result.media_summary?.media || null, host: result.host_summary || null });
      const candidates = result.media_summary?.candidates || [];
      console.table(candidates.slice(0, MAX_CANDIDATE_ROWS));
      if (candidates.length > MAX_CANDIDATE_ROWS) console.debug(`${candidates.length - MAX_CANDIDATE_ROWS} additional candidates omitted`);
      console.groupEnd();
    });
  }

  function scheduleCardScan(card, source = 'scheduled') {
    card = canonicalizeCard(card);
    if (!card?.isConnected || isInOverlay(card)) return;
    if (!pendingCards.has(card)) pendingCards.set(card, new Set());
    pendingCards.get(card).add(source);
    logDebug('scheduled card scan', { card_id: getCardId(card), post_path: getPostPath(card) || getCardId(card), source });
    if (!scanFrame) scanFrame = requestAnimationFrame(flushScans);
  }

  function collectAffectedCards(mutations) {
    const cards = new Set();
    const summary = { mutation_records: mutations.length, added_elements: 0, removed_elements: 0, extension_nodes_ignored: 0, canonical_cards_discovered: 0, unique_affected_cards: 0, cards_newly_queued: 0 };
    mutations.forEach((mutation) => {
      mutation.removedNodes.forEach((node) => { if (node instanceof Element) summary.removed_elements += 1; });
      if (mutation.target instanceof Element) { const targetCard = findCard(mutation.target); if (targetCard) cards.add(targetCard); }
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        summary.added_elements += 1;
        if (isInOverlay(node) || node.classList.contains(BUTTON_CLASS)) { summary.extension_nodes_ignored += 1; return; }
        const nearest = findCard(node); if (nearest) cards.add(nearest);
        if (node.matches(CARD_SELECTOR)) { const canonical = canonicalizeCard(node); if (canonical) { cards.add(canonical); summary.canonical_cards_discovered += 1; } }
        node.querySelectorAll(CARD_SELECTOR).forEach((card) => { const canonical = canonicalizeCard(card); if (canonical) { cards.add(canonical); summary.canonical_cards_discovered += 1; } });
        if ((node.matches('img, video') || node.querySelector('img, video')) && mutation.target instanceof Element) { const targetCard = findCard(mutation.target); if (targetCard) cards.add(targetCard); }
      });
    });
    [...cards].forEach((card) => { if (!card) cards.delete(card); });
    summary.unique_affected_cards = cards.size;
    return { cards, summary };
  }

  function restoreFocus() { const previousFocus = overlayState?.previousFocus; if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); }
  function pauseActiveVideo() { const video = overlayState?.activeMedia; if (video?.tagName === 'VIDEO') video.pause(); }
  function closeOverlay(reason = 'close-button') {
    if (!overlay) return;
    const state = overlayState;
    pauseActiveVideo(); document.removeEventListener('keydown', handleOverlayKeydown, true); overlay.remove(); overlay = null;
    if (state) { document.body.style.overflow = state.previousBodyOverflow; restoreFocus(); logInfo('fullscreen closed', { card_id: state.card_id, slide_count: state.slides.length, active_index: state.activeIndex, media_tag: state.activeMedia?.tagName?.toLowerCase() || '', close_reason: reason }); overlayState = null; }
  }

  function getFocusableOverlayElements() {
    if (!overlay) return [];
    return [...overlay.querySelectorAll('button, [href], input, select, textarea, video[controls], [tabindex]:not([tabindex="-1"])')].filter((element) => !element.disabled && element.getAttribute('aria-hidden') !== 'true');
  }

  function handleOverlayKeydown(e) {
    if (!overlay) return;
    if (e.key === 'Escape') { e.preventDefault(); closeOverlay('escape'); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); renderSlide(overlayState.activeIndex - 1); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); renderSlide(overlayState.activeIndex + 1); return; }
    if (e.key !== 'Tab') return;
    const focusable = getFocusableOverlayElements();
    if (!focusable.length) { e.preventDefault(); overlay.focus(); return; }
    const first = focusable[0]; const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function getPrimaryMedia(slide) { return slide.querySelector('video') || slide.querySelector('img'); }
  function mediaSignature(media) { return [media.currentSrc, media.src, media.getAttribute('src'), media.getAttribute('poster'), media.getAttribute('alt')].join('|'); }
  function findCarouselContainer(activeMedia, card) { const activeSlide = activeMedia.closest('li'); const list = activeSlide?.parentElement; if (list?.tagName === 'UL' && card?.contains(list)) return list; return null; }
  function buildSlideModel(activeMedia, card) {
    const single = { media: activeMedia, alt: activeMedia.getAttribute('alt') || '' };
    const container = findCarouselContainer(activeMedia, card);
    if (!container) return { slides: [single], activeIndex: 0 };
    const items = [...container.children].filter((child) => child.tagName === 'LI');
    const slides = []; let activeIndex = -1;
    items.forEach((item) => {
      const media = getPrimaryMedia(item);
      if (!media || media.closest(`.${BUTTON_CLASS}, ${OVERLAY_SELECTOR}`)) return;
      if (media.tagName !== 'IMG' && media.tagName !== 'VIDEO') return;
      const slide = { media, alt: media.getAttribute('alt') || '' };
      if (item.contains(activeMedia) || media === activeMedia) activeIndex = slides.length;
      slides.push(slide);
    });
    if (slides.length < 2) return { slides: [single], activeIndex: 0 };
    if (activeIndex < 0) { const activeSig = mediaSignature(activeMedia); activeIndex = slides.findIndex((slide) => mediaSignature(slide.media) === activeSig); }
    if (activeIndex < 0) activeIndex = 0;
    return { slides, activeIndex: Math.min(activeIndex, slides.length - 1) };
  }

  function cloneSlideMedia(slide) {
    const clone = slide.media.cloneNode(true);
    clone.removeAttribute('style'); clone.removeAttribute('id'); clone.querySelectorAll?.('[id]').forEach((element) => element.removeAttribute('id'));
    if (slide.alt && clone.tagName === 'IMG') clone.alt = slide.alt;
    if (clone.tagName === 'VIDEO') { clone.controls = true; clone.autoplay = true; clone.loop = true; clone.muted = false; clone.playsInline = true; }
    clone.addEventListener('click', (e) => e.stopPropagation());
    return clone;
  }

  function updateCarouselControls() {
    const { slides, activeIndex, previousButton, nextButton, counter, liveStatus } = overlayState;
    const hasMultiple = slides.length > 1;
    previousButton.hidden = !hasMultiple; nextButton.hidden = !hasMultiple; counter.hidden = !hasMultiple;
    previousButton.disabled = activeIndex <= 0; nextButton.disabled = activeIndex >= slides.length - 1;
    const text = `${activeIndex + 1} of ${slides.length}`;
    counter.textContent = text; counter.setAttribute('aria-label', `Slide ${text}`); liveStatus.textContent = hasMultiple ? `Slide ${text}` : '';
  }

  function renderSlide(index) {
    if (!overlayState || index < 0 || index >= overlayState.slides.length) return;
    pauseActiveVideo(); overlayState.activeIndex = index; overlayState.mediaWrap.replaceChildren(cloneSlideMedia(overlayState.slides[index])); overlayState.activeMedia = overlayState.mediaWrap.firstElementChild; updateCarouselControls();
    logDebug('fullscreen slide changed', { card_id: overlayState.card_id, active_index: overlayState.activeIndex, slide_count: overlayState.slides.length });
  }

  function logButtonActivation(card, media) {
    const slideModel = buildSlideModel(media, card);
    const rect = media.getBoundingClientRect();
    logInfo('fullscreen requested', { card_id: getCardId(card), post_path: getPostPath(card) || getCardId(card), selected_media_tag: media.tagName.toLowerCase(), selected_media_dimensions: `${Math.round(rect.width)}x${Math.round(rect.height)}`, carousel_slide_count: slideModel.slides.length, initial_slide_index: slideModel.activeIndex });
  }

  function openOverlay(mediaEl, card, invokingButton, replacementReason = 'replacement') {
    if (overlay) closeOverlay(replacementReason);
    const actualCard = card || findCard(mediaEl);
    const slideModel = buildSlideModel(mediaEl, actualCard);
    overlayState = { previousBodyOverflow: document.body.style.overflow, previousFocus: invokingButton || (document.activeElement instanceof HTMLElement ? document.activeElement : null), slides: slideModel.slides, activeIndex: slideModel.activeIndex, activeMedia: null, card_id: actualCard ? getCardId(actualCard) : '' };
    overlay = document.createElement('div'); overlay.className = 'igfs-container'; overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', 'Fullscreen Instagram media'); overlay.tabIndex = -1;
    const wrap = document.createElement('div'); wrap.className = 'igfs-media-wrap'; overlayState.mediaWrap = wrap;
    const previous = document.createElement('button'); previous.className = 'igfs-carousel-btn igfs-carousel-prev'; previous.type = 'button'; previous.setAttribute('aria-label', 'Show previous slide'); previous.textContent = '‹'; previous.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); renderSlide(overlayState.activeIndex - 1); });
    const next = document.createElement('button'); next.className = 'igfs-carousel-btn igfs-carousel-next'; next.type = 'button'; next.setAttribute('aria-label', 'Show next slide'); next.textContent = '›'; next.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); renderSlide(overlayState.activeIndex + 1); });
    const counter = document.createElement('div'); counter.className = 'igfs-carousel-counter';
    const liveStatus = document.createElement('div'); liveStatus.className = 'igfs-sr-only'; liveStatus.setAttribute('aria-live', 'polite');
    const close = document.createElement('button'); close.className = 'igfs-close'; close.type = 'button'; close.setAttribute('aria-label', 'Close fullscreen view'); close.textContent = '×';
    overlayState.previousButton = previous; overlayState.nextButton = next; overlayState.counter = counter; overlayState.liveStatus = liveStatus;
    close.addEventListener('click', () => closeOverlay('close-button'));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay('backdrop'); else if (e.target === wrap) closeOverlay('backdrop'); });
    overlay.appendChild(wrap); overlay.appendChild(previous); overlay.appendChild(next); overlay.appendChild(counter); overlay.appendChild(liveStatus); overlay.appendChild(close);
    document.body.appendChild(overlay); document.body.style.overflow = 'hidden'; document.addEventListener('keydown', handleOverlayKeydown, true); renderSlide(overlayState.activeIndex); close.focus({ preventScroll: true });
    logInfo('fullscreen opened', { card_id: overlayState.card_id, slide_count: overlayState.slides.length, active_index: overlayState.activeIndex, media_tag: overlayState.activeMedia?.tagName?.toLowerCase() || '' });
  }

  function runDiagnosticSnapshot() {
    const rawCards = [...document.querySelectorAll(CARD_SELECTOR)];
    const canonicalCards = [...new Set(rawCards.map(canonicalizeCard).filter(Boolean))];
    const results = canonicalCards.map((card) => scanCard(card, 'manual-diagnostic', { dryRun: true }));
    const duplicateButtonCount = canonicalCards.reduce((count, card) => count + Math.max(0, [...card.querySelectorAll(`:scope .${BUTTON_CLASS}`)].filter((button) => findCard(button) === card).length - 1), 0);
    const summary = { canonical_cards: canonicalCards.length, bound_cards: results.filter((result) => getCardButton(result.card)).length, unbound_cards: results.filter((result) => !getCardButton(result.card)).length, cards_outside_viewport: results.filter((result) => result.reason === 'card-outside-viewport').length, cards_with_no_eligible_media: results.filter((result) => result.reason === 'no-eligible-media').length, duplicate_button_count: duplicateButtonCount };
    console.groupCollapsed(`${LOG_PREFIX} diagnostic snapshot: ${summary.canonical_cards} canonical cards, ${summary.unbound_cards} unbound`);
    console.info('summary', summary);
    const rows = results.map(resultRow);
    console.table(rows.slice(0, MAX_SNAPSHOT_ROWS));
    if (rows.length > MAX_SNAPSHOT_ROWS) console.info(`${rows.length - MAX_SNAPSHOT_ROWS} additional rows omitted`);
    if (isDebug()) logDebugDetails(results);
    console.groupEnd();
  }

  function logInitialDiscovery(initialCards) {
    const rawCards = [...document.querySelectorAll(CARD_SELECTOR)];
    const articleCount = document.querySelectorAll('article').length;
    const dialogCount = document.querySelectorAll('div[role="dialog"]').length;
    const canonicalCount = new Set(rawCards.map(canonicalizeCard).filter(Boolean)).size;
    logInfo(`initial discovery: ${canonicalCount} canonical cards queued`, { raw_card_selector_matches: rawCards.length, article_count: articleCount, dialog_count: dialogCount, canonical_card_count: canonicalCount, discarded_during_canonicalization: rawCards.length - canonicalCount, cards_queued_for_initial_scanning: initialCards.length });
  }

  function initialize() {
    const manifest = typeof chrome !== 'undefined' ? chrome.runtime?.getManifest?.() || {} : {};
    logInfo('initialized', { version: manifest.version || 'unknown', diagnostics_level: diagnostics.level, pathname: location.pathname, ready_state: document.readyState, viewport: `${window.innerWidth}x${window.innerHeight}`, mutation_observer_enabled: true });
    const observer = new MutationObserver((mutations) => {
      const { cards, summary } = collectAffectedCards(mutations);
      if (!cards.size) return;
      summary.cards_newly_queued = [...cards].filter((card) => !pendingCards.has(card)).length;
      diagnostics.mutation = summary;
      logDebug('mutation batch queued cards', summary);
      cards.forEach((card) => scheduleCardScan(card, 'mutation'));
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('igfs:diagnose', runDiagnosticSnapshot);
    const initialCards = [...new Set([...document.querySelectorAll(CARD_SELECTOR)].map(canonicalizeCard).filter(Boolean))];
    logInitialDiscovery(initialCards);
    initialCards.forEach((card) => scheduleCardScan(card, 'initial'));
  }

  initialize();
})();
