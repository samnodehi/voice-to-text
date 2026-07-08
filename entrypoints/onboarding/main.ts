import './style.css';
import '@/assets/settings-form.css';
import { mountSettingsForm } from '@/components/settings-form';

const SOURCE: RecognitionSource = { kind: 'onboarding' };

// Line-icon glyphs for the test button (no dated emoji). Inherit color via currentColor.
const MIC_SVG =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-5a3.5 3.5 0 1 0-7 0v5A3.5 3.5 0 0 0 12 15z"/><path d="M18.5 11.5a.9.9 0 0 0-1.8 0 4.7 4.7 0 0 1-9.4 0 .9.9 0 0 0-1.8 0 6.5 6.5 0 0 0 5.6 6.44V20H8.8a.9.9 0 0 0 0 1.8h6.4a.9.9 0 0 0 0-1.8h-2.3v-2.06a6.5 6.5 0 0 0 5.6-6.44z"/></svg>';
const STOP_SVG =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2.5"/></svg>';

const micGranted = storage.defineItem<boolean>('local:micPermissionGranted', { fallback: false });

const grantBtn = document.getElementById('grant-btn') as HTMLButtonElement;
const grantStatus = document.getElementById('grant-status') as HTMLParagraphElement;
const toggleBtn = document.getElementById('toggle-btn') as HTMLButtonElement;
const micGlyph = document.getElementById('mic-glyph') as HTMLSpanElement;
const micLabel = document.getElementById('mic-label') as HTMLSpanElement;
const transcriptEl = document.getElementById('transcript') as HTMLDivElement;
const recStatus = document.getElementById('rec-status') as HTMLParagraphElement;
const savedToast = document.getElementById('saved-toast') as HTMLParagraphElement;

let t = createTranslator('auto');
let isListening = false;
let finalized = '';

function applyDocTheme(theme: string) {
  if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
}

function relabelPage() {
  document.documentElement.lang = t.lang;
  document.documentElement.dir = t.rtl ? 'rtl' : 'ltr';
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n as never;
    if (key) el.textContent = t.t(key);
  });
  transcriptEl.dataset.placeholder = t.t('ob.transcriptPlaceholder');
  updateMicButton();
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
function flashSaved() {
  savedToast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (savedToast.hidden = true), 1400);
}

function setStatus(el: HTMLElement, text: string, kind: 'success' | 'error' | 'idle') {
  el.textContent = text;
  el.dataset.kind = kind;
}

function updateMicButton() {
  toggleBtn.classList.toggle('btn--recording', isListening);
  micGlyph.innerHTML = isListening ? STOP_SVG : MIC_SVG;
  micLabel.textContent = isListening ? t.t('tip.stop') : t.t('tip.start');
}

function describeGrantError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError') return t.t('status.micDenied');
  if (name === 'NotFoundError' || name === 'NotReadableError') return t.t('status.audioError');
  return t.t('status.audioError');
}

grantBtn.addEventListener('click', async () => {
  grantBtn.disabled = true;
  setStatus(grantStatus, t.t('status.starting'), 'idle');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((tr) => tr.stop());
    await micGranted.setValue(true);
    setStatus(grantStatus, t.t('ob.grantedMsg'), 'success');
    grantBtn.textContent = t.t('ob.granted');
    toggleBtn.disabled = false;
  } catch (error) {
    grantBtn.disabled = false;
    setStatus(grantStatus, describeGrantError(error), 'error');
  }
});

function renderTranscript(text: string, isFinal: boolean) {
  if (isFinal) {
    finalized += text + ' ';
    transcriptEl.textContent = finalized;
  } else {
    transcriptEl.textContent = finalized + text;
  }
}

const ERROR_KEYS: Record<string, MessageKey> = {
  'not-allowed': 'status.micDenied',
  'audio-capture': 'status.audioError',
  'no-speech': 'status.noSpeech',
  network: 'status.network',
  'service-not-allowed': 'status.network',
  'language-not-supported': 'status.genericError',
  aborted: 'status.stopped',
  'bad-grammar': 'status.genericError',
  unknown: 'status.genericError',
};

toggleBtn.addEventListener('click', async () => {
  if (isListening) {
    browser.runtime.sendMessage({ target: 'background', type: 'recognition:stop' } as StopRecognitionRequest);
    return;
  }
  finalized = '';
  transcriptEl.textContent = '';
  setStatus(recStatus, t.t('status.starting'), 'idle');
  const settings = await getSettings();
  browser.runtime.sendMessage({
    target: 'background',
    type: 'recognition:start',
    lang: settings.language,
    source: SOURCE,
  } as StartRecognitionRequest);
});

browser.runtime.onMessage.addListener((message: unknown) => {
  if (!isExtensionMessage(message) || message.target !== 'client') return;
  if (!sourcesEqual(message.source, SOURCE)) return;
  switch (message.type) {
    case 'recognition:started':
      isListening = true;
      updateMicButton();
      setStatus(recStatus, t.t('status.listening'), 'success');
      break;
    case 'recognition:result':
      renderTranscript(message.transcript, message.isFinal);
      break;
    case 'recognition:error':
      setStatus(recStatus, t.t(ERROR_KEYS[message.error] ?? 'status.genericError'), 'error');
      break;
    case 'recognition:ended':
      isListening = false;
      updateMicButton();
      if (recStatus.dataset.kind !== 'error') setStatus(recStatus, t.t('status.stopped'), 'idle');
      break;
  }
});

async function init() {
  const settings = await getSettings().catch(() => DEFAULT_SETTINGS);
  t = createTranslator(settings.uiLanguage);
  applyDocTheme(settings.theme);

  const form = await mountSettingsForm(
    document.getElementById('settings-container')!,
    t,
    flashSaved,
    async () => {
      const next = await getSettings();
      t = createTranslator(next.uiLanguage);
      relabelPage();
      form.relabel(t);
    },
  );

  settingsStore.watch((next) => {
    if (next) applyDocTheme(next.theme);
  });

  if (await micGranted.getValue()) {
    setStatus(grantStatus, t.t('ob.grantedMsg'), 'success');
    grantBtn.textContent = t.t('ob.granted');
    toggleBtn.disabled = false;
  }

  relabelPage();
}

void init();
