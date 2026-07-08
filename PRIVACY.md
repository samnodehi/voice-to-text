# Privacy Policy — Voice to Text

_Last updated: 8 July 2026_

Voice to Text is a browser extension that turns speech into text in the field you're
typing in. This policy explains exactly what it does and does not do with your data.

## Short version

- **No account, no sign-in, no servers of our own.**
- **No analytics, no tracking, no advertising.**
- **We do not collect, store, sell, or share any personal information.**
- Your settings stay **on your device**.
- The microphone is only used **while you are actively dictating**.

## What the extension stores

The only thing the extension saves is your **settings** (spoken language, interface
language, theme, text-insertion mode, spoken-punctuation on/off, and the list of sites
where you've turned the mic icon off). These are kept in your browser's local extension
storage (`chrome.storage.local`) **on your own device**. They are never transmitted to us
or anyone else. Uninstalling the extension removes them.

## Microphone and speech recognition

- The microphone is activated **only when you start dictation** and is released as soon as
  you stop.
- The extension does **not** record, save, or upload audio files, and does **not** keep a
  history of what you dictate.
- Transcription is performed by your **browser's built-in Web Speech API**, not by us.
  **Important, in the interest of full transparency:** in Google Chrome this built-in
  engine sends your microphone audio to Google's speech-recognition service to convert it
  to text. That processing is part of Chrome itself and is governed by
  [Google's Privacy Policy](https://policies.google.com/privacy) — it is not something this
  extension adds, controls, or has access to. The extension merely receives the text result
  and puts it in your field.

## Permissions and why they exist

- **Microphone** — to hear your speech while dictating (requested once, the first time).
- **Storage** — to save your settings locally, as described above.
- **Host access to websites (`<all_urls>`)** — so the extension can show the mic icon on any
  page and place the transcribed text into the field you're using. No page content is read,
  collected, or transmitted; this access exists solely to deliver your own dictated text
  back into the tab you're typing in.

## Data sharing

The extension shares **no data** with the developer or any third party. The only outbound
data flow that occurs is the audio that **Chrome's own** speech engine sends to Google, as
described above — the same thing that happens for any website that uses the Web Speech API.

## Children's privacy

The extension does not knowingly collect any information from anyone, including children.

## Changes to this policy

If this policy changes, the "Last updated" date above will change and the new version will
be published in the project's repository.

## Contact

Questions about this policy can be raised via the project's GitHub repository issue tracker.

<!--
NOTE FOR SAM: Chrome Web Store also requires a contact email in your Developer Dashboard
(separate from this file). If you'd like a public contact address in this policy itself,
add it here before publishing. The repo is currently private — make it public (or host this
policy somewhere public, e.g. GitHub Pages) so the Web Store can link to it.
-->
