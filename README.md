# Voice to Text

**Free voice dictation in any text field, on any website.** Click into a text box,
click the microphone that appears, and speak — your words are transcribed live into a
small popup and typed straight into the field. 20+ languages, no account, no API key.

Built for high-quality **Persian (فارسی)** dictation, with first-class support for
English and 18 other languages.

> Status: `v0.1.0` — works end to end. Not yet on the Chrome Web Store; install from
> source (below).

---

## Features

- **Click-to-dictate anywhere** — a mic icon appears at the corner of any focused text
  field (`input`, `textarea`, or `contenteditable`). No per-site setup.
- **Live transcription** — see interim results as you speak in an attached popup, with a
  real-time audio-level meter so you know the mic is hearing you.
- **Types into the field _and_ shows the popup** — or switch to popup-only mode and copy
  manually. Your choice.
- **20+ languages** — English, Persian, Arabic, Turkish, German, French, Spanish, Italian,
  Russian, Portuguese, Hindi, Japanese, Korean, Chinese, Dutch, Polish, Indonesian,
  Swedish, Ukrainian, and more.
- **Smart, per-language output** — numbers and punctuation are written the way the
  language expects, automatically: Persian → ۱۲۳ and نیم‌فاصله, Arabic → ٠١٢٣, everything
  else → Latin. No toggles to fiddle with.
- **Spoken punctuation commands** — say "period", "comma", "new line" (or "نقطه"،
  "ویرگول"، "خط جدید"، …) in any supported language to insert punctuation.
- **Fully translated UI** — pick the extension's own language independently of the
  language you speak. Right-to-left layouts for Persian and Arabic.
- **Keyboard shortcut** — `Ctrl+Shift+Y` (`⌘⇧Y` on macOS) starts/stops dictation on the
  focused field.
- **Per-site on/off** — silence the mic icon on any site from the toolbar popup.
- **Light / dark / auto theme.**

## How it works

1. On first install, an onboarding page opens and asks for **one-time microphone access**.
2. Click into any text field on any page — a small mic icon appears just outside its
   top-right corner.
3. Click the icon (or press the shortcut). It turns into a stop button and a popup opens,
   transcribing live.
4. Click stop to end. Copy the text from the popup, or let it type straight into the field.

## Install from source

Requires [Node.js](https://nodejs.org) 18+.

```bash
npm install
npm run build
```

Then load it into Chrome:

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select the `.output/chrome-mv3` folder.

For live-reload development instead of a one-off build:

```bash
npm run dev
```

## Settings

Open the settings from the toolbar popup (⚙️) or the onboarding page. Everything
auto-saves:

| Setting | What it does |
| --- | --- |
| **Speech language** | The language you speak. Drives recognition, digits, and punctuation. |
| **Extension language** | The language of the UI itself (independent of speech). |
| **Theme** | Auto (match system), light, or dark. |
| **Text insertion** | Type into the field + popup, or popup-only. |
| **Spoken punctuation** | Turn "period"/"نقطه"/… into real punctuation. |
| **Per-site** | Disable the mic icon on the current site (toolbar popup). |

## Privacy

- The extension has **no servers, no account, and no analytics**. Your settings live only
  in your browser's local storage.
- Recognition is powered by the browser's built-in **Web Speech API**. Be aware that in
  Chrome this engine currently streams audio to Google's speech service for processing —
  that is Chrome's implementation, not something this extension adds. No audio is sent
  anywhere by the extension itself, and nothing is stored.
- The microphone is only active while you are dictating.

## Permissions

| Permission | Why it's needed |
| --- | --- |
| `offscreen` | Runs the speech-recognition engine in an offscreen document (the only place an extension can hold a live microphone stream in Manifest V3). |
| `storage` | Saves your settings locally. |
| `<all_urls>` (host) | So the background service worker can deliver transcription results back into the content script on whatever tab you're typing in. (`runtime.sendMessage` can't reach content scripts; results must go through `tabs.sendMessage`, which needs host access.) |

Microphone access itself is **not** a manifest permission — it's governed by the standard
browser `getUserMedia` origin-permission model, granted once during onboarding.

## Tech stack

- [WXT](https://wxt.dev) + TypeScript, Manifest V3
- Chrome Offscreen Documents for the mic + `webkitSpeechRecognition` engine
- Shadow DOM for the on-page UI (isolated from host-page styles)
- [@persian-tools/persian-tools](https://github.com/persian-tools/persian-tools) for
  Persian normalization
- [Vazirmatn](https://github.com/rastikerdar/vazirmatn) font (embedded) for Persian/Arabic UI

## Development

```bash
npm run dev        # dev build + live reload (Chrome)
npm run build      # production build → .output/chrome-mv3
npm run compile    # type-check only (tsc --noEmit)
npm run zip        # package for distribution
```

### A note on `npm audit`

`npm audit` reports advisories in the **development** toolchain (`wxt` →
`web-ext-run` → `fx-runner`/`node-notifier`/`tmp`/`uuid`). These are build/dev-time only.
`npm audit --omit=dev` reports **0 vulnerabilities** — nothing in the shipped extension is
affected. Do not run `npm audit fix --force`; it would downgrade/break the WXT build.

## Contributing

Translations especially are welcome. UI strings for the widely-spoken languages are
hand-written; the less common ones are best-effort. They live in
[`utils/i18n-messages.ts`](utils/i18n-messages.ts) — each language must provide every key
(TypeScript enforces this), so corrections and improvements are easy to spot and PR.

## License

[MIT](LICENSE) © 2026 Sam Nodehi.

Bundled third-party components (Vazirmatn font, persian-tools) retain their own licenses —
see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
