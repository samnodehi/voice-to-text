/**
 * Lightweight runtime-selectable i18n for the extension's own UI text.
 *
 * Chrome's built-in i18n (`chrome.i18n`) is locked to the browser locale and can't be
 * switched at runtime, but users pick the UI language independently — so this is a small
 * custom layer. English is the source of truth and the fallback for any missing key or
 * untranslated language. Message catalogs live in i18n-messages.ts.
 */
import { EN, DICTS, RTL_UI, type Dict, type MessageKey } from './i18n-messages';

/** Resolve a UI-language setting ('auto' or a code) to a concrete base language we support. */
export function resolveUiLang(setting: string): string {
  const raw = setting === 'auto' ? (navigator.language || 'en') : setting;
  const base = raw.toLowerCase().split('-')[0];
  return DICTS[base] ? base : 'en';
}

export function isRtlUi(lang: string): boolean {
  return RTL_UI.has(lang);
}

export interface Translator {
  lang: string;
  rtl: boolean;
  t: (key: MessageKey) => string;
}

/** Build a translator for a UI-language setting ('auto' or a concrete code). */
export function createTranslator(uiLangSetting: string): Translator {
  const lang = resolveUiLang(uiLangSetting);
  const dict: Dict = DICTS[lang] ?? EN;
  return {
    lang,
    rtl: isRtlUi(lang),
    t: (key) => dict[key] ?? EN[key],
  };
}
