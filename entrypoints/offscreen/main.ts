/**
 * Runs inside the hidden offscreen document (chrome-extension:// origin).
 * Owns the single active SpeechRecognition session for the whole extension —
 * only one field, in one tab, can be dictated into at a time.
 *
 * IMPORTANT (confirmed empirically, not just from docs): calling `recognition.start()`
 * with no arguments fails with error "not-allowed" in an offscreen document, even though
 * the extension origin already has microphone permission granted (via the onboarding
 * page). SpeechRecognition negotiates its own mic access internally, and that
 * negotiation apparently requires a visible page — something an offscreen document by
 * definition never has.
 *
 * Fix: we capture the microphone ourselves with getUserMedia (which *is* documented and
 * supported inside offscreen documents via the "USER_MEDIA" reason) and hand the
 * resulting MediaStreamTrack to `recognition.start(audioTrack)`. Per spec, starting from
 * a track sets `requestMicrophonePermission = false`, so SpeechRecognition skips its own
 * negotiation entirely and just consumes the audio we're already legitimately capturing.
 * See docs/research-notes.md, section 1a.
 *
 * This listener only ever receives `target: 'offscreen'` *commands* relayed by
 * background — never a client's original `target: 'background'` request — see the
 * messaging contract's docs for why that distinction matters. See docs/research-notes.md,
 * section 1b, for the "double start" bug that taught us this.
 */

type RecognitionCtor = typeof SpeechRecognition;

const FATAL_ERRORS: ReadonlySet<RecognitionErrorCode> = new Set([
  'not-allowed',
  'audio-capture',
  'service-not-allowed',
  'language-not-supported',
]);

/**
 * Guards against a tight restart loop if the browser keeps ending the session immediately.
 * The budget is only meant to catch an *unproductive* loop, so `onresult` clears it — a long
 * dictation with many natural pauses restarts often and must never be shut down for it.
 */
const MAX_RESTARTS_IN_WINDOW = 5;
const RESTART_WINDOW_MS = 10_000;

/** Counters for one dictation, logged when it ends — enough to diagnose a session after the fact. */
interface SessionStats {
  resultEvents: number;
  finals: number;
  interims: number;
  restarts: number;
  errors: string[];
}
let stats: SessionStats = { resultEvents: 0, finals: 0, interims: 0, restarts: 0, errors: [] };

let recognition: SpeechRecognition | null = null;
let audioStream: MediaStream | null = null;
let currentSource: RecognitionSource | null = null;
let shouldBeListening = false;
let lastErrorCode: RecognitionErrorCode | null = null;
let restartTimestamps: number[] = [];

// Live mic-level metering (for the popup waveform). Taps the same stream SpeechRecognition
// uses, via an AnalyserNode, and emits a smoothed 0–1 level a few times per second.
let levelContext: AudioContext | null = null;
let levelTimer: ReturnType<typeof setInterval> | undefined;

function startLevelMeter(stream: MediaStream, source: RecognitionSource) {
  stopLevelMeter();
  try {
    const ctx = new AudioContext();
    levelContext = ctx;
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let smoothed = 0;
    levelTimer = setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const level = Math.min(1, Math.sqrt(sum / buf.length) * 4); // scale RMS into a lively 0–1
      smoothed = smoothed * 0.6 + level * 0.4; // ease so the meter doesn't jitter
      emit({ target: 'client', type: 'recognition:level', source, level: smoothed });
    }, 90);
  } catch {
    // Metering is a nicety; never let it break recognition.
    stopLevelMeter();
  }
}

function stopLevelMeter() {
  if (levelTimer) clearInterval(levelTimer);
  levelTimer = undefined;
  levelContext?.close().catch(() => {});
  levelContext = null;
}

/**
 * Bumped by every start/stop call. `startRecognition` awaits microphone capture and
 * on-device availability before it actually calls `.start()`; if a newer start/stop
 * request arrives during that gap, the generation check lets the stale call abandon
 * itself (and release whatever track it already grabbed) instead of starting a second,
 * uncontrolled session.
 */
let setupGeneration = 0;

/** Set by stopRecognition() right before it calls .stop(), consumed by the resulting onend. */
let pendingStopReason: 'user-stopped' | undefined;

function getRecognitionCtor(): RecognitionCtor | undefined {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

/**
 * Browser APIs are not guaranteed to settle in bounded time, and offscreen documents in
 * particular have already shown one undocumented quirk (see the file header) — never let
 * a single await here be able to hang the whole session indefinitely.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms: ${label}`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Chrome 139+ can run recognition fully on-device for a growing list of languages
 * (see docs/research-notes.md). We always ask; today `fa-IR` reports "unavailable"
 * so this simply falls through to the normal server-based engine, but the moment
 * Google adds a language to that list, dictation becomes private with zero code changes.
 */
async function supportsOnDevice(ctor: RecognitionCtor, lang: string): Promise<boolean> {
  if (typeof ctor.available !== 'function') return false;
  try {
    const status = await withTimeout(
      ctor.available({ langs: [lang], processLocally: true }),
      3000,
      'SpeechRecognition.available()',
    );
    return status === 'available';
  } catch {
    return false;
  }
}

function tooManyRestarts(): boolean {
  const now = Date.now();
  restartTimestamps = restartTimestamps.filter((t) => now - t < RESTART_WINDOW_MS);
  restartTimestamps.push(now);
  return restartTimestamps.length > MAX_RESTARTS_IN_WINDOW;
}

function emit(
  message:
    | RecognitionStartedMessage
    | RecognitionResultMessage
    | RecognitionLevelMessage
    | RecognitionErrorMessage
    | RecognitionEndedMessage,
) {
  browser.runtime.sendMessage(message).catch((error) => {
    // Usually benign (the client tab closed mid-session), but a failure here means a
    // recognition result was silently dropped — never swallow it without a trace.
    console.warn('[voice-to-text/offscreen] failed to deliver', message.type, error);
  });
}

function stopAudioStream() {
  stopLevelMeter();
  audioStream?.getTracks().forEach((track) => track.stop());
  audioStream = null;
}

function teardownCurrentRecognition() {
  if (recognition) {
    const supersededSource = currentSource;
    recognition.onstart = null;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try {
      recognition.abort();
    } catch {
      // already stopped
    }
    recognition = null;
    // Only one session can run at a time; a new start() pre-empting an old one is the
    // only current caller of this path. Tell the pre-empted tab so its UI resets instead
    // of showing "recording" forever.
    if (supersededSource) {
      emit({ target: 'client', type: 'recognition:ended', source: supersededSource, reason: 'superseded' });
    }
  }
  stopAudioStream();
}

async function startRecognition(lang: string, source: RecognitionSource, config: OffscreenRunConfig) {
  // Bulletproofing: a start request that never resolves in an 'ended' leaves the client
  // UI stuck at "starting" forever with no error — which is exactly how a bug where this
  // function threw before emitting anything (offscreen has no chrome.storage access) hid
  // itself. Any unexpected throw now surfaces as a clean error + ended. See NOTES.md.
  try {
    await startRecognitionInner(lang, source, config);
  } catch (error) {
    console.error('[voice-to-text/offscreen] startRecognition threw', error);
    shouldBeListening = false;
    recognition = null;
    currentSource = null;
    stopAudioStream();
    emit({ target: 'client', type: 'recognition:error', source, error: 'unknown', message: String(error) });
    emit({ target: 'client', type: 'recognition:ended', source });
  }
}

async function startRecognitionInner(lang: string, source: RecognitionSource, config: OffscreenRunConfig) {
  teardownCurrentRecognition();

  const Ctor = getRecognitionCtor();
  if (!Ctor) {
    // Every start request must eventually resolve in exactly one 'ended', regardless of
    // how it failed, so clients have a single reliable "the session is definitely over"
    // signal instead of needing to guess based on which error occurred where.
    emit({
      target: 'client',
      type: 'recognition:error',
      source,
      error: 'unknown',
      message: 'SpeechRecognition is not supported in this browser.',
    });
    emit({ target: 'client', type: 'recognition:ended', source });
    return;
  }

  const myGeneration = ++setupGeneration;
  shouldBeListening = true;
  currentSource = source;
  lastErrorCode = null;
  restartTimestamps = [];
  stats = { resultEvents: 0, finals: 0, interims: 0, restarts: 0, errors: [] };

  // Text-processing prefs are passed in by background — offscreen documents can't read
  // chrome.storage themselves (only chrome.runtime is available here).
  const processing: ProcessingOptions = {
    lang,
    punctuationCommands: config.punctuationCommands,
  };
  // Per-session, so a new dictation always starts from a clean result index.
  const accumulator = createRecognitionAccumulator((raw) => processFinalTranscript(raw, processing));

  let stream: MediaStream;
  try {
    stream = await withTimeout(navigator.mediaDevices.getUserMedia({ audio: true }), 8000, 'getUserMedia()');
  } catch (error) {
    console.error('[voice-to-text/offscreen] getUserMedia failed', error);
    if (myGeneration !== setupGeneration) return;
    shouldBeListening = false;
    currentSource = null;
    emit({
      target: 'client',
      type: 'recognition:error',
      source,
      error: 'audio-capture',
      message: error instanceof DOMException ? error.message : String(error),
    });
    emit({ target: 'client', type: 'recognition:ended', source });
    return;
  }

  if (myGeneration !== setupGeneration) {
    // Superseded while awaiting getUserMedia; release the track we just grabbed and bail.
    stream.getTracks().forEach((track) => track.stop());
    return;
  }
  audioStream = stream;
  const track = stream.getAudioTracks()[0];
  startLevelMeter(stream, source);

  const instance = new Ctor();
  instance.lang = lang;
  instance.continuous = true;
  instance.interimResults = true;
  instance.maxAlternatives = 1;
  if (await supportsOnDevice(Ctor, lang)) {
    instance.processLocally = true;
  }

  if (myGeneration !== setupGeneration) {
    // Superseded while awaiting on-device availability; release the track and bail.
    stopAudioStream();
    return;
  }

  instance.onstart = () => {
    emit({ target: 'client', type: 'recognition:started', source });
  };

  instance.onresult = (event: SpeechRecognitionEvent) => {
    lastErrorCode = null;
    // A result means this session is productive. Clearing the restart budget here is the
    // difference between "guard against a broken loop" and "shut the user up mid-dictation
    // because they paused six times" — the latter is what actually happened.
    restartTimestamps = [];
    const { finalText, interimText } = accumulator.consume(event.results);
    stats.resultEvents++;
    if (finalText) stats.finals++;
    if (interimText) stats.interims++;
    // Always emit: the event only fires when something changed, and an interim that shrank
    // back to '' still has to reach the client so it can clear the stale tail.
    emit({ target: 'client', type: 'recognition:result', source, finalText, interimText });
  };

  instance.onerror = (event: SpeechRecognitionErrorEvent) => {
    lastErrorCode = (event.error as RecognitionErrorCode) || 'unknown';
    stats.errors.push(lastErrorCode);
    console.error('[voice-to-text/offscreen] recognition error:', lastErrorCode, event.message);
    emit({ target: 'client', type: 'recognition:error', source, error: lastErrorCode, message: event.message || undefined });
  };

  /**
   * Commit whatever the engine was still revising. A session that ends — whether the user
   * stopped it or Chrome timed it out on silence — throws away its un-finalized tail, and
   * the restarted session begins from an empty result list, so anything not committed here
   * is gone for good. If Chrome did finalize the tail first, onresult already cleared
   * pendingInterim and this is a no-op, so it can never double-commit.
   */
  const flushPendingInterim = () => {
    const finalText = accumulator.takePendingFinal();
    if (!finalText) return;
    emit({ target: 'client', type: 'recognition:result', source, finalText, interimText: '' });
  };

  instance.onend = () => {
    const isFatal = lastErrorCode !== null && FATAL_ERRORS.has(lastErrorCode);
    const trackStillLive = track.readyState === 'live';
    flushPendingInterim();

    if (shouldBeListening && !isFatal && trackStillLive) {
      if (tooManyRestarts()) {
        // Genuinely stuck (restarting with nothing to show for it). Ending quietly here is
        // what made dictation "just stop writing" with no explanation, so say so.
        console.warn('[voice-to-text/offscreen] restart loop detected; stopping', stats);
        emit({
          target: 'client',
          type: 'recognition:error',
          source,
          error: 'unknown',
          message: 'Recognition kept restarting without producing results; stopped.',
        });
      } else {
        // Chrome auto-stops `continuous` recognition after periods of silence; restart
        // transparently, reusing the same track, so dictation feels uninterrupted.
        // The new session reports results from index 0 again, so reset our own counter.
        stats.restarts++;
        accumulator.resetSessionIndex();
        try {
          instance.start(track);
        } catch {
          setTimeout(() => {
            if (shouldBeListening) {
              try {
                instance.start(track);
              } catch {
                /* give up silently; the next user click will retry from scratch */
              }
            }
          }, 250);
        }
        return;
      }
    }

    shouldBeListening = false;
    recognition = null;
    currentSource = null;
    stopAudioStream();
    console.info('[voice-to-text/offscreen] session ended', { reason: pendingStopReason ?? 'engine', ...stats });
    emit({ target: 'client', type: 'recognition:ended', source, reason: pendingStopReason });
    pendingStopReason = undefined;
  };

  recognition = instance;
  try {
    instance.start(track);
  } catch (error) {
    console.error('[voice-to-text/offscreen] recognition.start(track) threw synchronously', error);
  }
}

function stopRecognition() {
  setupGeneration++;
  shouldBeListening = false;
  // Let the real onend handler fire so a single, consistent 'recognition:ended' + stream
  // cleanup happens in one place. If nothing is actually running, there's nothing to stop.
  if (recognition) {
    pendingStopReason = 'user-stopped';
    recognition.stop();
  }
}

browser.runtime.onMessage.addListener((message: unknown) => {
  if (!isExtensionMessage(message) || message.target !== 'offscreen') return undefined;

  if (message.type === 'recognition:start') {
    void startRecognition(message.lang, message.source, message.config);
  } else if (message.type === 'recognition:stop') {
    stopRecognition();
  }
  return undefined;
});
