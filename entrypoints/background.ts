const OFFSCREEN_PATH = '/offscreen.html';
const ONBOARDING_PATH = '/onboarding.html';

/**
 * The background service worker is the only context allowed to own the
 * offscreen document's lifecycle. It lazily creates it on the first
 * recognition request and relays `target: 'background'` client requests to
 * offscreen as `target: 'offscreen'` commands.
 *
 * These are deliberately different `target` values, not just different message
 * `type`s: sendMessage broadcasts to every context, so if a client's original
 * request also carried `target: 'offscreen'`, the offscreen document (once it
 * existed) would pick it up *directly* — in addition to background's relay —
 * and every start/stop got processed twice. See docs/research-notes.md.
 *
 * `target: 'client'` messages (recognition results/errors/etc.) are broadcast by
 * the offscreen document via runtime.sendMessage. That reaches other *extension pages*
 * (like the onboarding page) directly — but crucially it does NOT reach content scripts
 * injected in web-page tabs. Delivery to a content script requires
 * chrome.tabs.sendMessage(tabId, …), which only background can call (offscreen documents
 * have no tabs API). So background forwards every tab-addressed client message to the
 * right tab. See docs/research-notes.md, section 1d — this was the single biggest wrong
 * assumption in the original design.
 */
export default defineBackground(() => {
  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      browser.tabs.create({ url: browser.runtime.getURL(ONBOARDING_PATH) });
    }
  });

  browser.runtime.onMessage.addListener((message: unknown, sender) => {
    if (!isExtensionMessage(message)) return undefined;

    if (message.target === 'client') {
      trackActiveSource(message);
      // Onboarding (an extension page) already got this via the runtime broadcast; only
      // content-script tabs need an explicit hand-off, since runtime.sendMessage never
      // reaches them.
      if (message.source.kind === 'tab') {
        browser.tabs.sendMessage(message.source.tabId, message).catch(() => {
          // Tab was closed/navigated mid-session, or has no content script (e.g. a
          // chrome:// page). Nothing actionable; the session cleans up on its own.
        });
      }
      return undefined;
    }

    if (message.target !== 'background') return undefined;

    if (message.type === 'open-options') {
      browser.runtime.openOptionsPage().catch(() => {});
      return undefined;
    }

    const source = deriveSource(sender);
    if (!source) return undefined; // message didn't come from a context we can identify/trust

    return relayToOffscreen(message, source);
  });

  // Safety net: if the tab that owns the active session closes outright, the offscreen
  // document would otherwise keep listening to a mic no one can see or stop.
  browser.tabs.onRemoved.addListener((tabId) => {
    if (activeSource?.kind === 'tab' && activeSource.tabId === tabId) {
      const stopCommand: StopRecognitionCommand = { target: 'offscreen', type: 'recognition:stop' };
      browser.runtime.sendMessage(stopCommand).catch(() => {});
    }
  });

  // Keyboard shortcut → tell the active tab's content script to toggle dictation on its
  // focused field. (Content scripts can't register global shortcuts themselves.)
  browser.commands.onCommand.addListener((command, tab) => {
    if (command !== 'toggle-dictation' || tab?.id === undefined) return;
    const toggle: ToggleDictationCommand = { target: 'command', type: 'toggle-dictation' };
    browser.tabs.sendMessage(tab.id, toggle).catch(() => {});
  });
});

let activeSource: RecognitionSource | null = null;

function trackActiveSource(
  message:
    | RecognitionStartedMessage
    | RecognitionResultMessage
    | RecognitionLevelMessage
    | RecognitionErrorMessage
    | RecognitionEndedMessage,
) {
  if (message.type === 'recognition:started') {
    activeSource = message.source;
  } else if (message.type === 'recognition:ended' && activeSource && sourcesEqual(activeSource, message.source)) {
    activeSource = null;
  }
}

/**
 * Background is the trust boundary: it decides who a message "is" from the
 * runtime.MessageSender rather than believing whatever `source` the sender put in the
 * message body. The onboarding page is a real tab too, so it's told apart from a
 * content-script tab by its extension-page URL, not by tab presence.
 */
function deriveSource(sender: Browser.runtime.MessageSender): RecognitionSource | null {
  if (sender.url === browser.runtime.getURL(ONBOARDING_PATH)) {
    return { kind: 'onboarding' };
  }
  if (sender.tab?.id !== undefined) {
    return { kind: 'tab', tabId: sender.tab.id };
  }
  return null;
}

async function relayToOffscreen(
  message: StartRecognitionRequest | StopRecognitionRequest,
  source: RecognitionSource,
): Promise<RecognitionSource> {
  await ensureOffscreenDocument();
  let command: StartRecognitionCommand | StopRecognitionCommand;
  if (message.type === 'recognition:start') {
    // Offscreen can't read chrome.storage; hand it the settings it needs here.
    const settings = await getSettings();
    command = {
      target: 'offscreen',
      type: 'recognition:start',
      lang: message.lang,
      source,
      config: {
        punctuationCommands: settings.punctuationCommands,
      },
    };
  } else {
    command = { target: 'offscreen', type: 'recognition:stop' };
  }
  await browser.runtime.sendMessage(command);
  return source;
}

async function hasOffscreenDocument(): Promise<boolean> {
  const contexts = await browser.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [browser.runtime.getURL(OFFSCREEN_PATH)],
  });
  return contexts.length > 0;
}

async function ensureOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) return;

  try {
    await browser.offscreen.createDocument({
      url: OFFSCREEN_PATH,
      reasons: ['USER_MEDIA'],
      justification:
        'Capture microphone audio and run live Web Speech API recognition for voice dictation.',
    });
  } catch (error) {
    // Two near-simultaneous start requests can both fail the hasOffscreenDocument() check
    // before either creates the document. Only re-throw if the document truly doesn't exist.
    if (!(await hasOffscreenDocument())) throw error;
  }
}
