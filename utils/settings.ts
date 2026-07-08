/**
 * The single source of truth for user-configurable settings, shared by every context
 * (content script, offscreen engine, options page, onboarding, popup).
 *
 * Stored in `storage.local`. The extension is fully free/on-device-of-the-browser — there
 * are no API keys or cloud engines here (removed by design: kept everything free and
 * lightweight).
 */

export type ThemeId = 'auto' | 'light' | 'dark';
export type InsertModeId = 'direct-and-popup' | 'popup-only';

/**
 * Recognition languages offered in the UI. English first (default). These are common
 * BCP-47 tags Chrome's Web Speech API supports.
 */
export const SUPPORTED_LANGUAGES = [
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'fa-IR', label: 'فارسی' },
  { code: 'ar-SA', label: 'العربية' },
  { code: 'tr-TR', label: 'Türkçe' },
  { code: 'de-DE', label: 'Deutsch' },
  { code: 'fr-FR', label: 'Français' },
  { code: 'es-ES', label: 'Español' },
  { code: 'it-IT', label: 'Italiano' },
  { code: 'ru-RU', label: 'Русский' },
  { code: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'hi-IN', label: 'हिन्दी' },
  { code: 'ja-JP', label: '日本語' },
  { code: 'ko-KR', label: '한국어' },
  { code: 'zh-CN', label: '中文 (简体)' },
  { code: 'nl-NL', label: 'Nederlands' },
  { code: 'pl-PL', label: 'Polski' },
  { code: 'id-ID', label: 'Bahasa Indonesia' },
  { code: 'sv-SE', label: 'Svenska' },
  { code: 'uk-UA', label: 'Українська' },
] as const;

export interface Settings {
  /** Recognition language (what you speak), BCP-47. Default English. */
  language: string;
  /** Language of the extension's own UI text. 'auto' follows the browser. */
  uiLanguage: string;
  theme: ThemeId;
  insertMode: InsertModeId;
  /** Turn spoken punctuation words ("period", "نقطه") into real punctuation. */
  punctuationCommands: boolean;
  /** Hostnames where the mic icon is suppressed (per-site off switch from the toolbar popup). */
  disabledSites: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'en-US',
  uiLanguage: 'auto',
  theme: 'auto',
  insertMode: 'direct-and-popup',
  punctuationCommands: true,
  disabledSites: [],
};

/** One storage item holding the whole settings object; simplest to read/write/watch atomically. */
export const settingsStore = storage.defineItem<Settings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
});

/**
 * Reads settings and fills any missing keys with defaults (forward-compatible with new
 * fields). Never throws — if storage is somehow unavailable, callers still get usable
 * defaults rather than a rejected promise that could break a whole page's init.
 */
export async function getSettings(): Promise<Settings> {
  try {
    const stored = await settingsStore.getValue();
    return { ...DEFAULT_SETTINGS, ...stored };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function patchSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await settingsStore.setValue(next);
  return next;
}
