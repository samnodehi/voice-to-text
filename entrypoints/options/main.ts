import './style.css';
import '@/assets/settings-form.css';
import { mountSettingsForm } from '@/components/settings-form';

const savedToast = document.getElementById('saved-toast') as HTMLParagraphElement;
const openOnboarding = document.getElementById('open-onboarding') as HTMLButtonElement;

let toastTimer: ReturnType<typeof setTimeout> | undefined;
function flashSaved() {
  savedToast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    savedToast.hidden = true;
  }, 1400);
}

function applyDocTheme(theme: string) {
  if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
}

/** Re-translate every element on the page that carries a data-i18n key. */
function relabelPage(t: ReturnType<typeof createTranslator>) {
  document.documentElement.lang = t.lang;
  document.documentElement.dir = t.rtl ? 'rtl' : 'ltr';
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n as never;
    if (key) el.textContent = t.t(key);
  });
}

async function init() {
  const settings = await getSettings().catch(() => DEFAULT_SETTINGS);
  let translator = createTranslator(settings.uiLanguage);
  applyDocTheme(settings.theme);

  const form = await mountSettingsForm(
    document.getElementById('settings-container')!,
    translator,
    flashSaved,
    async () => {
      // UI language changed — rebuild the translator and relabel everything live.
      const next = await getSettings();
      translator = createTranslator(next.uiLanguage);
      relabelPage(translator);
      form.relabel(translator);
    },
  );

  // Theme changes from the form should re-apply to this page immediately.
  settingsStore.watch((next) => {
    if (next) applyDocTheme(next.theme);
  });

  openOnboarding.addEventListener('click', () => {
    browser.tabs.create({ url: browser.runtime.getURL('/onboarding.html') });
  });

  relabelPage(translator);
}

void init();
