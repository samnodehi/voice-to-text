# Chrome Web Store — listing & submission pack

Everything needed to fill in the Chrome Web Store (CWS) Developer Dashboard for
**Voice to Text**. Copy the text blocks straight into the form.

---

## Store listing

**Item name**

```
Voice to Text
```

**Summary** (max 132 chars — this one is 115)

```
Free voice dictation in any text field, on any website. 20+ languages, runs in your browser, no account or API key.
```

**Category:** Productivity
**Language:** English

**Detailed description**

```
Voice to Text turns your speech into text right where you're typing. Click into any
text box on any website, click the microphone that appears, and start talking — your
words show up live and are typed straight into the field.

No account. No API key. No setup beyond a one-time microphone permission.

FEATURES
• Works in any text field on any site — input boxes, comment fields, rich editors.
• Live transcription with an on-screen audio meter so you know it's listening.
• Types into the field and shows a popup — or switch to popup-only and copy manually.
• 20+ languages: English, Persian, Arabic, Turkish, German, French, Spanish, Italian,
  Russian, Portuguese, Hindi, Japanese, Korean, Chinese, Dutch, Polish, Indonesian,
  Swedish, Ukrainian and more.
• Smart output: numbers and punctuation are written the way each language expects
  (Persian ۱۲۳, Arabic ٠١٢٣) — automatically.
• Spoken punctuation: say "period", "comma", "new line" (or the equivalent in your
  language) to insert punctuation.
• Fully translated interface with right-to-left support for Persian and Arabic.
• Keyboard shortcut (Ctrl+Shift+Y / Cmd+Shift+Y).
• Turn the mic icon off on any site you like.
• Light, dark, and automatic themes.

PRIVACY
The extension has no servers, no account, and no analytics. Your settings stay on your
device. Transcription uses your browser's built-in speech engine; note that in Chrome
that engine sends audio to Google's speech service to convert it to text (that's part
of Chrome, not something this extension adds). See the privacy policy for details.

Great for writing in Persian and other languages where typing is slower than speaking.
```

---

## Privacy practices tab

- **Single purpose** (paste into the "single purpose" field):

  ```
  Voice to Text lets the user dictate text by voice into any editable field on a web
  page: it shows a microphone control on focused text fields, transcribes the user's
  speech using the browser's Web Speech API, and inserts the resulting text into the
  field.
  ```

- **Permission justifications** (one per prompt in the dashboard):

  | Permission | Justification to paste |
  | --- | --- |
  | `offscreen` | Manifest V3 service workers cannot hold a live microphone stream. The extension uses an offscreen document to run `getUserMedia` and the Web Speech API for the duration of dictation. |
  | `storage` | Saves the user's own preferences (languages, theme, insertion mode, per-site on/off) locally with `chrome.storage.local`. No data leaves the device. |
  | `host permissions (<all_urls>)` | The extension must show the mic control and insert dictated text on whatever page the user is typing on. Delivering results from the background service worker to the page requires `tabs.sendMessage`, which needs host access. No page content is read or transmitted. |
  | Microphone (`getUserMedia`) | Required to capture the user's speech for transcription. Requested once during onboarding; the mic is active only while dictating. |

- **Data usage disclosures:** The extension itself collects **no** user data — check "does
  not collect" for every category, and confirm the three required certifications (no
  selling data, no unrelated use, no creditworthiness use).

  > ⚠️ Be ready for a reviewer question about the broad host permission and the microphone.
  > Point them to the privacy policy: the extension transmits nothing itself; the only audio
  > that leaves the machine is what **Chrome's own** Web Speech API sends to Google, exactly
  > as it would for any website using that API.

- **Privacy policy URL:** host [`PRIVACY.md`](../PRIVACY.md) at a public URL (e.g. make the
  GitHub repo public and link the raw file, or enable GitHub Pages) and paste that URL.

---

## Graphics you still need to create (can't be auto-generated)

- **Screenshots** — at least 1, up to 5, at **1280×800** or 640×400 PNG/JPEG. Suggested set:
  1. Mic icon on a focused text field on a normal website.
  2. The live popup mid-dictation (audio meter + transcript visible).
  3. Persian dictation showing ۱۲۳ digits + RTL text.
  4. The toolbar popup (per-site toggle + Settings/Mic buttons).
  5. The settings/onboarding page.
- **Store icon** — 128×128 (already in the build at `icon/128.png`).
- **Small promo tile** (optional) — 440×280.

---

## Submission checklist

- [ ] Build the upload package: `npm run zip` → `.output/voice-to-text-extension-0.1.0-chrome.zip`.
- [ ] Create/confirm a Chrome Web Store **developer account** (one-time US$5 fee). *(You must
      do this — I can't create accounts or pay fees.)*
- [ ] Publish the privacy policy at a public URL and note it above.
- [ ] Capture the screenshots listed above.
- [ ] In the dashboard: create item → upload the zip → paste the listing text → paste the
      single purpose + permission justifications → complete the privacy tab → add screenshots.
- [ ] Submit for review.

> Note: publishing to the Web Store and creating the developer account are actions only you
> can take (account creation, payment, and submission). I've prepared everything up to the
> upload; the zip and all copy are ready.
