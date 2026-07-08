# Third-party notices

Voice to Text bundles the following third-party components. Their licenses are
reproduced in full in the [`licenses/`](licenses/) directory.

## Vazirmatn (font)

- Copyright 2015 The Vazirmatn Project Authors — <https://github.com/rastikerdar/vazirmatn>
- License: SIL Open Font License, Version 1.1 — [`licenses/Vazirmatn-OFL-1.1.txt`](licenses/Vazirmatn-OFL-1.1.txt)
- The Arabic subset (weights 400/700) is embedded as base64 in `assets/vazirmatn.css`
  so Persian/Arabic UI text renders correctly without a network request.

## @persian-tools/persian-tools

- Copyright (c) 2017 Ali Torki
- License: MIT — [`licenses/persian-tools-MIT.txt`](licenses/persian-tools-MIT.txt)
- Used for Persian text normalization: ZWNJ (نیم‌فاصله) insertion, Arabic→Persian
  character folding, and English→Persian/Arabic digit conversion.

## Build tooling

The extension is built with [WXT](https://wxt.dev) and TypeScript. These are
development dependencies only and are **not** part of the shipped extension.
