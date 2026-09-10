import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    default_locale: 'en',
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    // "microphone" is not a real manifest permission — mic access is governed by the
    // standard getUserMedia origin-permission model (see docs/research-notes.md, section 1).
    //
    // `activeTab` covers the toolbar popup reading the current tab's hostname for the
    // per-site on/off switch. It is granted only when the user invokes the extension —
    // which is exactly when that popup opens — and unlike host_permissions or the `tabs`
    // permission it adds no install warning of its own.
    permissions: ['offscreen', 'storage', 'activeTab'],
    // NOTE: `host_permissions: ['<all_urls>']` was removed here. It was originally added
    // alongside the switch to tabs.sendMessage (research-notes § 1d) on the assumption that
    // delivering a message to our own declaratively-injected content script needs host
    // access. The Chrome docs never actually say that, so this build exists to test it: the
    // content script is injected via content_scripts.matches, which is its own grant.
    // If dictation still reaches the page, the permission was never needed.
    // Keyboard shortcut to start/stop dictation on the focused field without the mouse.
    commands: {
      'toggle-dictation': {
        suggested_key: { default: 'Ctrl+Shift+Y', mac: 'Command+Shift+Y' },
        description: 'Start / stop voice dictation on the focused field',
      },
    },
  },
});
