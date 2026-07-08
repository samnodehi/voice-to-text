import { getSettings, patchSettings, DEFAULT_SETTINGS, SUPPORTED_LANGUAGES, type Settings } from '@/utils/settings';
import { UI_LANGUAGES } from '@/utils/i18n-messages';
import { type Translator } from '@/utils/i18n';

/**
 * Renders the shared settings controls (speech language, UI language, theme, insertion
 * mode, punctuation) into a container and wires auto-save. Used by BOTH the options page
 * and the onboarding page so first-time users configure everything in one place without
 * hunting for a separate settings screen.
 */
export interface SettingsFormHandle {
  /** Re-apply the current UI-language texts (call after the UI language changes). */
  relabel: (t: Translator) => void;
}

export async function mountSettingsForm(
  container: HTMLElement,
  translator: Translator,
  onSaved: () => void,
  onUiLangChange: () => void,
): Promise<SettingsFormHandle> {
  let t = translator;
  const settings = await getSettings().catch(() => DEFAULT_SETTINGS);

  const row = (labelKey: string, control: HTMLElement, hintKey?: string): HTMLElement => {
    const wrap = document.createElement('div');
    wrap.className = 'set-block';
    const r = document.createElement('div');
    r.className = 'set-row';
    const label = document.createElement('label');
    label.dataset.i18n = labelKey;
    label.textContent = t.t(labelKey as never);
    label.htmlFor = control.id;
    r.append(label, control);
    wrap.append(r);
    if (hintKey) {
      const hint = document.createElement('p');
      hint.className = 'set-hint';
      hint.dataset.i18n = hintKey;
      hint.textContent = t.t(hintKey as never);
      wrap.append(hint);
    }
    return wrap;
  };

  const select = (id: string, options: Array<{ value: string; label: string; i18nLabel?: string }>): HTMLSelectElement => {
    const s = document.createElement('select');
    s.className = 'control';
    s.id = id;
    for (const o of options) {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      if (o.i18nLabel) opt.dataset.i18n = o.i18nLabel;
      s.append(opt);
    }
    return s;
  };

  // Speech language
  const langSel = select(
    'set-language',
    SUPPORTED_LANGUAGES.map((l) => ({ value: l.code, label: l.label })),
  );
  langSel.value = settings.language;

  // UI language
  const uiLangSel = select(
    'set-ui-language',
    UI_LANGUAGES.map((l) => ({
      value: l.code,
      label: l.code === 'auto' ? t.t('set.uiLangAuto') : l.native,
      i18nLabel: l.code === 'auto' ? 'set.uiLangAuto' : undefined,
    })),
  );
  uiLangSel.value = settings.uiLanguage;

  // Theme
  const themeSel = select('set-theme', [
    { value: 'auto', label: t.t('set.themeAuto'), i18nLabel: 'set.themeAuto' },
    { value: 'light', label: t.t('set.themeLight'), i18nLabel: 'set.themeLight' },
    { value: 'dark', label: t.t('set.themeDark'), i18nLabel: 'set.themeDark' },
  ]);
  themeSel.value = settings.theme;

  // Insert mode
  const insertSel = select('set-insert', [
    { value: 'direct-and-popup', label: t.t('set.insertDirect'), i18nLabel: 'set.insertDirect' },
    { value: 'popup-only', label: t.t('set.insertPopup'), i18nLabel: 'set.insertPopup' },
  ]);
  insertSel.value = settings.insertMode;

  // Punctuation toggle
  const punctRow = document.createElement('label');
  punctRow.className = 'switch-row';
  const punctText = document.createElement('span');
  const punctTitle = document.createElement('span');
  punctTitle.className = 'switch-title';
  punctTitle.dataset.i18n = 'set.punctLabel';
  punctTitle.textContent = t.t('set.punctLabel');
  const punctDesc = document.createElement('span');
  punctDesc.className = 'switch-desc';
  punctDesc.dataset.i18n = 'set.punctDesc';
  punctDesc.textContent = t.t('set.punctDesc');
  punctText.append(punctTitle, punctDesc);
  const punctInput = document.createElement('input');
  punctInput.type = 'checkbox';
  punctInput.className = 'switch';
  punctInput.id = 'set-punct';
  punctInput.checked = settings.punctuationCommands;
  punctRow.append(punctText, punctInput);

  container.append(
    row('set.langLabel', langSel, 'set.langHint'),
    row('set.uiLangLabel', uiLangSel),
    row('set.themeLabel', themeSel),
    row('set.insertLabel', insertSel),
    punctRow,
  );

  const save = async (patch: Partial<Settings>) => {
    await patchSettings(patch);
    onSaved();
  };

  langSel.addEventListener('change', () => save({ language: langSel.value }));
  themeSel.addEventListener('change', () => save({ theme: themeSel.value as Settings['theme'] }));
  insertSel.addEventListener('change', () => save({ insertMode: insertSel.value as Settings['insertMode'] }));
  punctInput.addEventListener('change', () => save({ punctuationCommands: punctInput.checked }));
  uiLangSel.addEventListener('change', async () => {
    await save({ uiLanguage: uiLangSel.value });
    onUiLangChange();
  });

  return {
    relabel: (next) => {
      t = next;
      container.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
        const key = el.dataset.i18n as never;
        if (key) el.textContent = next.t(key);
      });
    },
  };
}
