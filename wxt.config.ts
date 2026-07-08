import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    default_locale: 'en',
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    // "microphone" is not a real manifest permission — mic access is governed by the
    // standard getUserMedia origin-permission model (see docs/research-notes.md, section 1).
    permissions: ['offscreen', 'storage'],
    // Needed so background can chrome.tabs.sendMessage recognition results back to the
    // content script in any tab. runtime.sendMessage does NOT reach content scripts —
    // only extension pages — so tab delivery must go through tabs.sendMessage, which
    // requires host access to the target tab. See docs/research-notes.md, section 1d.
    host_permissions: ['<all_urls>'],
    // Keyboard shortcut to start/stop dictation on the focused field without the mouse.
    commands: {
      'toggle-dictation': {
        suggested_key: { default: 'Ctrl+Shift+Y', mac: 'Command+Shift+Y' },
        description: 'Start / stop voice dictation on the focused field',
      },
    },
  },
});
