/**
 * Shared, typed message contract between the background service worker,
 * the offscreen document (actual mic capture + recognition), and any
 * client context (onboarding page today; tab content scripts from Phase 1).
 *
 * Runtime messages are broadcast to every extension context, so every
 * message carries an explicit `target` and every listener must ignore
 * messages that aren't addressed to it.
 */

/** Identifies who owns/should receive events for a recognition session. */
export type RecognitionSource =
  | { kind: 'onboarding' }
  | { kind: 'tab'; tabId: number };

/**
 * `target: 'offscreen'` used to mean "client wants this done" AND "background is telling
 * offscreen to do it." That was a real bug, not just a naming nit: sendMessage broadcasts
 * to every context, so once the offscreen document existed, it received the client's
 * original request *directly* (matching its own `target: 'offscreen'` filter) in addition
 * to background's relay — every start/stop got processed twice, and the two listeners
 * racing to respond to the same original message produced
 * "message channel closed before a response was received" errors that silently broke the
 * client's UI. Client requests and background's relayed commands now use distinct `target`
 * values so offscreen's listener can only ever match the relay. See docs/research-notes.md.
 */
export interface StartRecognitionRequest {
  target: 'background';
  type: 'recognition:start';
  lang: string;
  source: RecognitionSource;
}

export interface StopRecognitionRequest {
  target: 'background';
  type: 'recognition:stop';
}

/** Content scripts can't call chrome.runtime.openOptionsPage; they ask background to. */
export interface OpenOptionsRequest {
  target: 'background';
  type: 'open-options';
}

/**
 * Runtime config the offscreen document needs but can't read itself: offscreen documents
 * are limited to the chrome.runtime API and have NO access to chrome.storage. So background
 * (which does) reads settings and passes the relevant slice down in the start command.
 * See docs/research-notes.md § ۶.
 */
export interface OffscreenRunConfig {
  punctuationCommands: boolean;
}

export interface StartRecognitionCommand {
  target: 'offscreen';
  type: 'recognition:start';
  lang: string;
  source: RecognitionSource;
  config: OffscreenRunConfig;
}

export interface StopRecognitionCommand {
  target: 'offscreen';
  type: 'recognition:stop';
}

export interface RecognitionStartedMessage {
  target: 'client';
  type: 'recognition:started';
  source: RecognitionSource;
}

export interface RecognitionResultMessage {
  target: 'client';
  type: 'recognition:result';
  source: RecognitionSource;
  transcript: string;
  isFinal: boolean;
}

/** Live mic level (0–1) for the popup meter, emitted a few times per second while active. */
export interface RecognitionLevelMessage {
  target: 'client';
  type: 'recognition:level';
  source: RecognitionSource;
  level: number;
}

/** Background → content-script tab: keyboard-shortcut toggle of dictation on the focused field. */
export interface ToggleDictationCommand {
  target: 'command';
  type: 'toggle-dictation';
}

/** Mirrors the SpeechRecognitionErrorEvent.error union from the Web Speech API spec. */
export type RecognitionErrorCode =
  | 'no-speech'
  | 'audio-capture'
  | 'not-allowed'
  | 'network'
  | 'aborted'
  | 'language-not-supported'
  | 'service-not-allowed'
  | 'bad-grammar'
  | 'unknown';

export interface RecognitionErrorMessage {
  target: 'client';
  type: 'recognition:error';
  source: RecognitionSource;
  error: RecognitionErrorCode;
  /** Human-readable detail for cases the error code alone doesn't explain (e.g. unsupported browser). */
  message?: string;
}

export interface RecognitionEndedMessage {
  target: 'client';
  type: 'recognition:ended';
  source: RecognitionSource;
  /**
   * Why the session ended, so the UI can explain it instead of just going quiet:
   * - 'user-stopped': the user (or their own tab) clicked stop.
   * - 'superseded': another tab started a new session; only one can run at a time.
   * - 'tab-closed': the tab that owned the session was closed or navigated away.
   * Omitted for a plain natural end (e.g. after a fatal recognition error).
   */
  reason?: 'user-stopped' | 'superseded' | 'tab-closed';
}

export type ExtensionMessage =
  | StartRecognitionRequest
  | StopRecognitionRequest
  | OpenOptionsRequest
  | StartRecognitionCommand
  | StopRecognitionCommand
  | ToggleDictationCommand
  | RecognitionStartedMessage
  | RecognitionResultMessage
  | RecognitionLevelMessage
  | RecognitionErrorMessage
  | RecognitionEndedMessage;

export function isExtensionMessage(value: unknown): value is ExtensionMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'target' in value &&
    'type' in value
  );
}

export function isRecognitionSource(value: unknown): value is RecognitionSource {
  if (typeof value !== 'object' || value === null || !('kind' in value)) return false;
  const v = value as { kind: unknown; tabId?: unknown };
  if (v.kind === 'onboarding') return true;
  if (v.kind === 'tab') return typeof v.tabId === 'number';
  return false;
}

export function sourcesEqual(a: RecognitionSource, b: RecognitionSource): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'tab' && b.kind === 'tab') return a.tabId === b.tabId;
  return true;
}
