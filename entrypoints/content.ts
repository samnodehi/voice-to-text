import '@/assets/content.css';

const ICON_SIZE = 34;
const ICON_GAP = 6; // gap between the field edge and the icon (icon sits OUTSIDE the field)
const POPUP_HEIGHT_ESTIMATE = 240;
const AUTO_HIDE_DELAY_MS = 1500;
const METER_BARS = 22;
/**
 * The popup is a live preview, not a document viewer. Re-writing an ever-growing string into
 * the DOM on every interim event (several per second) is what made long dictation crawl, so
 * only the tail is rendered — the full text still lives in `finalizedTranscript` for copying.
 */
const MAX_POPUP_CHARS = 2000;

/**
 * Clean line icons (Feather/Lucide-style) as inline SVG — far more modern than emoji, and
 * they inherit color via currentColor so they theme automatically. `mic`/`stop` fill white
 * for the coloured field button; the popup glyphs use stroke.
 */
const ICONS = {
  mic: '<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-5a3.5 3.5 0 1 0-7 0v5A3.5 3.5 0 0 0 12 15z"/><path d="M18.5 11.5a.9.9 0 0 0-1.8 0 4.7 4.7 0 0 1-9.4 0 .9.9 0 0 0-1.8 0 6.5 6.5 0 0 0 5.6 6.44V20H8.8a.9.9 0 0 0 0 1.8h6.4a.9.9 0 0 0 0-1.8h-2.3v-2.06a6.5 6.5 0 0 0 5.6-6.44z"/></svg>',
  stop: '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2.5"/></svg>',
  copy: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>',
  gear: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
};

const ERROR_KEYS: Record<RecognitionErrorCode, MessageKey> = {
  'not-allowed': 'status.micDenied',
  'audio-capture': 'status.audioError',
  'no-speech': 'status.noSpeech',
  network: 'status.network',
  aborted: 'status.stopped',
  'language-not-supported': 'status.genericError',
  'service-not-allowed': 'status.network',
  'bad-grammar': 'status.genericError',
  unknown: 'status.genericError',
};

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  cssInjectionMode: 'ui',

  async main(ctx) {
    // Never let a storage hiccup stop the content script from loading — fall back to
    // defaults so the icon still works everywhere.
    let settings = await getSettings().catch(() => DEFAULT_SETTINGS);
    let tr = createTranslator(settings.uiLanguage);
    const isDisabledHere = () => settings.disabledSites.includes(location.hostname);
    settingsStore.watch((next) => {
      const previousLanguage = settings.language;
      if (next) settings = { ...settings, ...next };
      tr = createTranslator(settings.uiLanguage);
      applyTheme();
      relabelPopup();
      // Keep the in-page switcher in step with a change made elsewhere (toolbar popup,
      // Settings page, another tab) so the two never disagree about the current language.
      if (langSelectEl) langSelectEl.value = settings.language;
      // Changing the speech language from the toolbar mid-dictation should behave exactly
      // like changing it from the in-page switcher: finish this session and come straight
      // back in the new language.
      if (settings.language !== previousLanguage && isListening) {
        pendingRestart = true;
        sendStop();
      }
      // If this site was just disabled from the toolbar popup, tear the UI down live.
      if (isDisabledHere()) {
        if (isListening) sendStop();
        clearActiveField();
      }
    });

    let activeField: EditableField | null = null;
    let isListening = false;
    let isMounted = false;
    let mySource: RecognitionSource | null = null;
    let finalizedTranscript = '';
    let interimTranscript = '';
    /** Writes into the focused field, keeping the still-revising tail replaceable. */
    let fieldWriter: FieldWriter | null = null;
    let autoHideTimer: ReturnType<typeof setTimeout> | undefined;

    /** Whether dictation should be typed into the page field at all. */
    const writesToField = () => settings.insertMode !== 'popup-only';
    /** In 'field-only' the popup stays out of the way — but errors still force it open. */
    const showsPopup = () => settings.insertMode !== 'field-only';

    let rootEl!: HTMLDivElement;
    let iconEl!: HTMLButtonElement;
    let iconGlyphEl!: HTMLSpanElement;
    let popupEl!: HTMLDivElement;
    let statusEl!: HTMLSpanElement;
    let transcriptEl!: HTMLDivElement;
    let copyBtn!: HTMLButtonElement;
    let meterEl!: HTMLDivElement;
    let langSelectEl!: HTMLSelectElement;
    const meterHistory = new Array(METER_BARS).fill(0);
    let pendingRestart = false;

    const ui = await createShadowRootUi(ctx, {
      // 'inline' = WXT just attaches the shadow host and stays out of positioning; our own
      // .vtt-root (position:fixed, max z-index) handles placement and stacking. Anchored to
      // <html> rather than <body> so a page that puts `transform` on <body> can't turn our
      // fixed layer into a transformed-ancestor containing block.
      name: 'voice-to-text-ui',
      position: 'inline',
      anchor: 'html',
      onMount(container) {
        // Icon-first UI: buttons are glyphs with translated tooltips, so almost nothing
        // needs translating and the icons read the same in any language.
        container.innerHTML = `
          <div class="vtt-root">
            <button type="button" class="vtt-icon">
              <span class="vtt-icon-glyph">${ICONS.mic}</span>
            </button>
            <div class="vtt-popup" role="group" aria-label="Voice to Text" hidden>
              <div class="vtt-popup-header">
                <span class="vtt-popup-status" role="status" aria-live="polite" aria-atomic="true"></span>
                <div class="vtt-popup-header-actions">
                  <button type="button" class="vtt-icon-btn vtt-settings-btn">${ICONS.gear}</button>
                  <button type="button" class="vtt-icon-btn vtt-popup-close">${ICONS.close}</button>
                </div>
              </div>
              <div class="vtt-meter" aria-hidden="true"></div>
              <div class="vtt-transcript" dir="auto"></div>
              <div class="vtt-popup-actions">
                <select class="vtt-lang-select"></select>
                <span class="vtt-actions-spacer"></span>
                <button type="button" class="vtt-icon-btn vtt-copy-btn">${ICONS.copy}</button>
                <button type="button" class="vtt-icon-btn vtt-clear-btn">${ICONS.trash}</button>
              </div>
            </div>
          </div>
        `;
        rootEl = container.querySelector('.vtt-root')!;
        iconEl = container.querySelector('.vtt-icon')!;
        iconGlyphEl = container.querySelector('.vtt-icon-glyph')!;
        popupEl = container.querySelector('.vtt-popup')!;
        statusEl = container.querySelector('.vtt-popup-status')!;
        transcriptEl = container.querySelector('.vtt-transcript')!;
        copyBtn = container.querySelector('.vtt-copy-btn')!;
        meterEl = container.querySelector('.vtt-meter')!;
        langSelectEl = container.querySelector('.vtt-lang-select')!;
        const clearBtn = container.querySelector<HTMLButtonElement>('.vtt-clear-btn')!;
        const closeBtn = container.querySelector<HTMLButtonElement>('.vtt-popup-close')!;
        const settingsBtn = container.querySelector<HTMLButtonElement>('.vtt-settings-btn')!;

        // Build the waveform meter bars once.
        for (let i = 0; i < METER_BARS; i++) {
          const bar = document.createElement('span');
          bar.className = 'vtt-meter-bar';
          meterEl.append(bar);
        }
        // Populate the quick language selector.
        for (const l of SUPPORTED_LANGUAGES) {
          const opt = document.createElement('option');
          opt.value = l.code;
          opt.textContent = l.label;
          langSelectEl.append(opt);
        }
        langSelectEl.value = settings.language;
        langSelectEl.addEventListener('change', () => changeLanguage(langSelectEl.value));
        // Clicking the select shouldn't count as leaving the field / bubble oddly.
        langSelectEl.addEventListener('mousedown', (e) => e.stopPropagation());

        iconEl.addEventListener('click', onIconClick);
        copyBtn.addEventListener('click', onCopyClick);
        clearBtn.addEventListener('click', () => {
          finalizedTranscript = '';
          transcriptEl.textContent = '';
        });
        closeBtn.addEventListener('click', () => {
          if (isListening) sendStop();
          hidePopup();
        });
        settingsBtn.addEventListener('click', () => {
          browser.runtime
            .sendMessage({ target: 'background', type: 'open-options' } as OpenOptionsRequest)
            .catch(() => {});
        });
        relabelPopup();
      },
    });

    // Apply translated tooltips + direction to the popup. Safe to call before mount (no-op).
    function relabelPopup() {
      if (!popupEl) return;
      popupEl.dir = tr.rtl ? 'rtl' : 'ltr';
      // Icon-only buttons: give them both a hover tooltip (title) and an accessible name
      // (aria-label) so screen readers announce them even where title isn't exposed.
      const set = (sel: string, key: MessageKey) => {
        const el = rootEl?.querySelector<HTMLElement>(sel);
        if (el) {
          el.title = tr.t(key);
          el.setAttribute('aria-label', tr.t(key));
        }
      };
      set('.vtt-copy-btn', 'tip.copy');
      set('.vtt-clear-btn', 'tip.clear');
      set('.vtt-popup-close', 'tip.close');
      set('.vtt-settings-btn', 'tip.settings');
      langSelectEl?.setAttribute('aria-label', tr.t('set.langLabel'));
      iconEl?.setAttribute('aria-label', tr.t(isListening ? 'tip.stop' : 'tip.start'));
    }

    function ensureMounted() {
      if (isMounted) return;
      ui.mount();
      isMounted = true;
      applyTheme();
    }

    function unmountIfIdle() {
      if (isListening || !isMounted) return;
      ui.remove();
      isMounted = false;
    }

    function applyTheme() {
      if (!ui.shadowHost) return;
      if (settings.theme === 'auto') ui.shadowHost.removeAttribute('data-theme');
      else ui.shadowHost.setAttribute('data-theme', settings.theme);
    }

    function applyIconPosition(field: EditableField) {
      // Anchor the icon just OUTSIDE the field's top-right corner (right edge, above the
      // top edge). Sitting outside the field's box means it never overlaps the field's
      // own inline controls (search/clear/send buttons) the way an inside-the-box icon did.
      //
      // Coordinates are VIEWPORT-relative, not document-relative: WXT's "modal" shadow
      // container is position:fixed inset:0, so .vtt-root (absolute inside it) is measured
      // from the viewport. Scroll is tracked by re-running this on scroll, not by adding
      // scroll offsets — see scheduleReposition().
      const rect = field.getBoundingClientRect();

      // Place the icon OUTSIDE the field box, aligned to its right edge. Prefer just above
      // the top edge; if the field hugs the top of the viewport (e.g. a site header search
      // box), drop below the bottom edge instead. Either way it never overlaps the field's
      // own inline controls, which sit inside the box.
      const roomAbove = rect.top >= ICON_SIZE + ICON_GAP + 2;
      const top = roomAbove ? rect.top - ICON_SIZE - ICON_GAP : rect.bottom + ICON_GAP;
      const left = rect.right - ICON_SIZE;

      const clampedTop = Math.max(2, Math.min(top, window.innerHeight - ICON_SIZE - 2));
      rootEl.style.top = `${clampedTop}px`;
      rootEl.style.left = `${Math.max(2, Math.min(left, window.innerWidth - ICON_SIZE - 2))}px`;

      // Open the popup in whichever vertical direction has more room, measured from the icon.
      const openUp = window.innerHeight - clampedTop - ICON_SIZE < POPUP_HEIGHT_ESTIMATE;
      popupEl.classList.toggle('vtt-above', openUp);
      popupEl.classList.toggle('vtt-below', !openUp);
    }

    function setActiveField(field: EditableField) {
      activeField = field;
      ensureMounted();
      applyIconPosition(field);
    }

    function clearActiveField() {
      if (isListening) return;
      activeField = null;
      // Only touch UI elements if we've actually mounted (onMount assigns them). A focusout
      // anywhere on the page reaches this before the first field is ever focused, when
      // popupEl/etc. are still undefined.
      if (isMounted) hidePopup();
      unmountIfIdle();
    }

    let repositionScheduled = false;
    function scheduleReposition() {
      if (repositionScheduled || !activeField) return;
      repositionScheduled = true;
      requestAnimationFrame(() => {
        repositionScheduled = false;
        if (!activeField) return;
        // isConnected (not document.contains) so a field living inside a shadow tree still
        // counts as present — document.contains returns false for shadow-nested nodes.
        if (!activeField.isConnected) {
          clearActiveField();
          return;
        }
        applyIconPosition(activeField);
      });
    }

    function setStatus(text: string, kind: 'success' | 'error' | 'idle') {
      statusEl.textContent = text;
      statusEl.dataset.kind = kind;
    }

    function showPopup() {
      if (!popupEl) return;
      window.clearTimeout(autoHideTimer);
      popupEl.hidden = false;
      if (activeField) applyIconPosition(activeField);
    }

    function hidePopup() {
      if (!popupEl) return;
      window.clearTimeout(autoHideTimer);
      popupEl.hidden = true;
    }

    function scheduleAutoHidePopup() {
      window.clearTimeout(autoHideTimer);
      // Never auto-hide an error: 1.5s is not long enough to read one, and the user needs it
      // to act (grant the mic, reload the page). They dismiss it with the close button.
      if (statusEl?.dataset.kind === 'error') return;
      autoHideTimer = setTimeout(hidePopup, AUTO_HIDE_DELAY_MS);
    }

    function updateIconVisualState() {
      iconEl.classList.toggle('vtt-recording', isListening);
      iconGlyphEl.innerHTML = isListening ? ICONS.stop : ICONS.mic;
      iconEl.setAttribute('aria-label', tr.t(isListening ? 'tip.stop' : 'tip.start'));
    }

    /**
     * Coalesced to one DOM write per frame. The previous version wrote the whole accumulated
     * transcript and then read scrollHeight on *every* interim event, forcing a synchronous
     * reflow several times a second over a string that only ever grew — the cause of the
     * progressive slowdown and stalls during long dictation.
     */
    let transcriptRenderQueued = false;
    function scheduleTranscriptRender() {
      if (!transcriptEl || transcriptRenderQueued) return;
      transcriptRenderQueued = true;
      requestAnimationFrame(() => {
        transcriptRenderQueued = false;
        if (!transcriptEl) return;
        const full = finalizedTranscript + interimTranscript;
        transcriptEl.textContent = full.length > MAX_POPUP_CHARS ? full.slice(-MAX_POPUP_CHARS) : full;
        transcriptEl.scrollTop = transcriptEl.scrollHeight;
      });
    }

    function resetTranscript() {
      finalizedTranscript = '';
      interimTranscript = '';
      if (transcriptEl) transcriptEl.textContent = '';
    }

    async function onCopyClick() {
      const text = finalizedTranscript.trim();
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const scratch = document.createElement('textarea');
        scratch.value = text;
        scratch.style.position = 'fixed';
        scratch.style.opacity = '0';
        document.body.append(scratch);
        scratch.select();
        try {
          document.execCommand('copy');
        } catch {
          /* clipboard unavailable in this context; nothing more we can do */
        }
        scratch.remove();
      }
      // Flash a checkmark on the copy button, then restore the copy icon.
      copyBtn.innerHTML = ICONS.check;
      copyBtn.title = tr.t('tip.copied');
      setTimeout(() => {
        copyBtn.innerHTML = ICONS.copy;
        copyBtn.title = tr.t('tip.copy');
      }, 1200);
    }

    // Simple bar-history waveform: newest level on the leading edge, older levels scroll off.
    function renderMeter(level: number) {
      // Skip entirely while the popup is hidden (notably 'field-only'): 22 inline style
      // writes ~11×/second is real layout work to spend on something nobody can see.
      if (!meterEl || popupEl?.hidden !== false) return;
      meterHistory.push(level);
      meterHistory.shift();
      const bars = meterEl.children;
      for (let i = 0; i < bars.length; i++) {
        const h = Math.max(8, Math.round(meterHistory[i] * 100));
        (bars[i] as HTMLElement).style.height = `${h}%`;
      }
    }

    function resetMeter() {
      meterHistory.fill(0);
      if (meterEl) {
        for (const bar of Array.from(meterEl.children)) (bar as HTMLElement).style.height = '8%';
      }
    }

    async function changeLanguage(lang: string) {
      settings.language = lang;
      if (langSelectEl) langSelectEl.value = lang;
      patchSettings({ language: lang }).catch(() => {});
      // Apply immediately: if we're mid-session, cleanly restart in the new language once
      // the current session ends (see the 'recognition:ended' handler).
      if (isListening) {
        pendingRestart = true;
        sendStop();
      }
    }

    async function onIconClick() {
      if (isListening) {
        sendStop();
        return;
      }
      if (!activeField) return;

      // Flip synchronously (before any await) so the focusout this click also triggers on
      // the field sees isListening=true already and keeps the UI up. The real confirmation
      // arrives later via the 'recognition:started' broadcast; this is optimistic UI.
      isListening = true;
      updateIconVisualState();
      resetMeter();
      resetTranscript();
      // Bind a writer to this field for the session, so the interim tail can be rewritten
      // in place as the engine revises it rather than only landing when a segment finalizes.
      fieldWriter = writesToField() ? createFieldWriter(activeField) : null;
      setStatus(tr.t('status.starting'), 'idle');
      if (showsPopup()) showPopup();

      // When the extension is reloaded or updated, content scripts already injected into
      // open tabs are orphaned: chrome.runtime.id goes undefined and every runtime call
      // throws "Extension context invalidated". We can't recover in place (the script has
      // to be re-injected by a page reload), so detect it up front and tell the user
      // exactly what to do instead of showing a generic connection error.
      if (!isExtensionContextValid()) {
        showContextInvalidated();
        return;
      }

      // Everything from here on is wrapped: this whole function runs detached from any
      // user gesture chain by the time an await resolves, so an uncaught rejection from
      // *anything* in this block — not just sendMessage — would otherwise vanish into an
      // unhandled promise rejection and leave the UI stuck in the optimistic "starting"
      // state forever, with no visible error. Learned the hard way; see NOTES.md.
      try {
        const placeholderSource: RecognitionSource = { kind: 'tab', tabId: -1 };
        const startRequest: StartRecognitionRequest = {
          target: 'background',
          type: 'recognition:start',
          lang: settings.language,
          source: placeholderSource,
        };
        const resolved = await browser.runtime.sendMessage(startRequest);
        if (isRecognitionSource(resolved)) {
          mySource = resolved;
        } else {
          console.warn('[voice-to-text] background did not return a valid source; results will be ignored');
        }
      } catch (error) {
        console.error('[voice-to-text] starting recognition failed', error);
        isListening = false;
        updateIconVisualState();
        if (String(error).includes('Extension context invalidated')) {
          showContextInvalidated();
        } else {
          setStatus(tr.t('status.connectError'), 'error');
          scheduleAutoHidePopup();
        }
      }
    }

    function isExtensionContextValid(): boolean {
      try {
        return !!browser.runtime?.id;
      } catch {
        return false;
      }
    }

    function showContextInvalidated() {
      isListening = false;
      updateIconVisualState();
      setStatus(tr.t('status.contextInvalidated'), 'error');
      // Deliberately do NOT auto-hide: the user needs to read and act on this one.
      window.clearTimeout(autoHideTimer);
    }

    function sendStop() {
      const stopRequest: StopRecognitionRequest = { target: 'background', type: 'recognition:stop' };
      browser.runtime.sendMessage(stopRequest).catch(() => {});
    }

    function onFocusIn(event: FocusEvent) {
      if (isListening) return; // keep the session locked to the field it started on
      if (isDisabledHere()) return; // user switched the extension off for this site
      // event.target is retargeted to the shadow HOST when the real focused element lives
      // inside a web component's shadow root (e.g. YouTube's <ytd-searchbox>, Google
      // Translate). composedPath()[0] is the true innermost element, before retargeting —
      // without this, fields inside shadow DOM never get an icon. See research-notes § ۵ت.
      const target = event.composedPath()[0];
      if (target instanceof Element && isEditableField(target)) {
        setActiveField(target);
      }
    }

    function onFocusOut() {
      requestAnimationFrame(() => {
        if (isListening) return;
        const active = deepActiveElement();
        if (isEditableField(active)) return; // moved to another valid field; its focusin already re-anchored
        // Node.contains() does NOT cross shadow boundaries, so shadowHost.contains(button)
        // is false for our own buttons (they live inside the shadow tree). Check the shadow
        // root itself — otherwise clicking our icon reads as "focus left" and tears the UI
        // down, which looked like "everything disappears on click".
        if (ui.shadow.contains(active)) return;
        clearActiveField();
      });
    }

    // document.activeElement stops at the outermost shadow host; recurse into shadow roots
    // to find the element that actually has focus, so a shadow-nested input reads as
    // "still an editable field" rather than "focus left".
    function deepActiveElement(): Element | null {
      let el: Element | null = document.activeElement;
      while (el?.shadowRoot?.activeElement) {
        el = el.shadowRoot.activeElement;
      }
      return el;
    }

    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);
    window.addEventListener('scroll', scheduleReposition, { capture: true, passive: true });
    window.addEventListener('resize', scheduleReposition, { passive: true });

    // Keyboard-shortcut toggle, delivered by background via tabs.sendMessage.
    function toggleDictation() {
      if (isListening) {
        sendStop();
        return;
      }
      if (!activeField) {
        const active = deepActiveElement();
        if (isEditableField(active)) setActiveField(active);
      }
      if (activeField) void onIconClick();
    }

    browser.runtime.onMessage.addListener((message: unknown) => {
      if (!isExtensionMessage(message)) return undefined;

      if (message.target === 'command' && message.type === 'toggle-dictation') {
        toggleDictation();
        return undefined;
      }

      if (message.target !== 'client') return undefined;
      if (!mySource || !sourcesEqual(message.source, mySource)) return undefined;

      switch (message.type) {
        case 'recognition:started':
          isListening = true;
          updateIconVisualState();
          setStatus(tr.t('status.listening'), 'success');
          break;
        case 'recognition:level':
          renderMeter(message.level);
          break;
        case 'recognition:result':
          if (message.finalText) finalizedTranscript += message.finalText;
          interimTranscript = message.interimText;
          scheduleTranscriptRender();
          // Commit first, then re-lay the new tail after it, so the field always mirrors
          // exactly what the popup shows — including words that are still being revised.
          // Guarded: a host editor that re-renders mid-write must not throw out of this
          // listener and take the whole dictation session down with it.
          try {
            if (message.finalText) fieldWriter?.commit(message.finalText);
            fieldWriter?.setInterim(message.interimText);
          } catch (error) {
            console.warn('[voice-to-text] could not write into this field', error);
          }
          break;
        case 'recognition:error': {
          // 'no-speech' fires on every natural pause and 'aborted' on a normal stop — they
          // are status, not failure. Treating them as errors made the popup burst open on
          // every pause in field-only mode and then refuse to auto-hide.
          const transient = message.error === 'no-speech' || message.error === 'aborted';
          setStatus(tr.t(ERROR_KEYS[message.error] ?? 'status.genericError'), transient ? 'idle' : 'error');
          // A real failure the user can't see is one they can't fix — force the popup open
          // even in 'field-only', where it is otherwise deliberately kept out of the way.
          if (!transient) showPopup();
          break;
        }
        case 'recognition:ended':
          isListening = false;
          updateIconVisualState();
          mySource = null;
          resetMeter();
          // The engine flushes its un-finalized tail as a final before ending, so whatever
          // is still marked interim here has already been superseded; drop the tracking.
          interimTranscript = '';
          // One line per session, in the page's own console: the offscreen summary cannot see
          // which field kind this was or whether live interim actually reached the page.
          if (fieldWriter) {
            console.info('[voice-to-text] field writer', { host: location.hostname, ...fieldWriter.stats() });
          }
          fieldWriter?.reset();
          fieldWriter = null;
          if (message.reason === 'superseded') {
            setStatus(tr.t('status.superseded'), 'idle');
          }
          // A language change mid-session asked us to restart cleanly once the old session
          // ended — do it now, in the newly-selected language.
          if (pendingRestart && activeField) {
            pendingRestart = false;
            void onIconClick();
            break;
          }
          // Only the popup auto-hides here; the icon should stay put (and stay mounted)
          // as long as the field is still focused. onFocusOut/clearActiveField is the
          // only path that should ever unmount the icon itself.
          scheduleAutoHidePopup();
          if (!activeField) unmountIfIdle();
          break;
      }
      return undefined;
    });

    ctx.onInvalidated(() => {
      if (isListening) sendStop();
    });
  },
});
