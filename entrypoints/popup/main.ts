import './style.css';

const siteRow = document.getElementById('site-row') as HTMLLabelElement;
const siteLabel = document.getElementById('site-label') as HTMLSpanElement;
const siteToggle = document.getElementById('site-toggle') as HTMLInputElement;
const btnSettings = document.getElementById('btn-settings') as HTMLButtonElement;
const btnMic = document.getElementById('btn-mic') as HTMLButtonElement;

function applyDocTheme(theme: string) {
  if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
}

/** Translate every element carrying a data-i18n key, and set page language/direction. */
function relabelPage(t: ReturnType<typeof createTranslator>) {
  document.documentElement.lang = t.lang;
  document.documentElement.dir = t.rtl ? 'rtl' : 'ltr';
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n as never;
    if (key) el.textContent = t.t(key);
  });
}

/**
 * Return the hostname of the active tab, but only for pages the extension can actually run
 * on (http/https). chrome://, extension, and other privileged pages return null so we hide
 * the per-site toggle there — it would have no effect.
 */
async function activeHostname(): Promise<string | null> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return null;
    const url = new URL(tab.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.hostname;
  } catch {
    return null;
  }
}

async function init() {
  const settings = await getSettings();
  const t = createTranslator(settings.uiLanguage);
  applyDocTheme(settings.theme);
  relabelPage(t);

  const host = await activeHostname();
  if (host) {
    const reflect = (disabled: boolean) => {
      siteToggle.checked = !disabled;
      siteLabel.textContent = disabled ? t.t('pop.disabledHere') : t.t('pop.enabledHere');
    };
    reflect(settings.disabledSites.includes(host));
    siteRow.hidden = false;

    siteToggle.addEventListener('change', async () => {
      const enabled = siteToggle.checked;
      const current = await getSettings();
      const set = new Set(current.disabledSites);
      if (enabled) set.delete(host);
      else set.add(host);
      await patchSettings({ disabledSites: [...set] });
      reflect(!enabled);
    });
  }

  btnSettings.addEventListener('click', () => {
    void browser.runtime.openOptionsPage();
    window.close();
  });

  btnMic.addEventListener('click', () => {
    void browser.tabs.create({ url: browser.runtime.getURL('/onboarding.html') });
    window.close();
  });
}

void init();
