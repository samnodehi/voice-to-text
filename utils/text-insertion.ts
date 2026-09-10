import type { EditableField } from '@/utils/field-detection';

/**
 * React (and other frameworks that wrap inputs as "controlled" components) override the
 * native `value` setter on input/textarea elements to intercept writes. Setting `.value`
 * directly is invisible to them and gets silently reverted. Calling the *native* setter
 * explicitly, then dispatching a real `input` event, is the standard workaround.
 */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  nativeSetter?.call(el, value);
}

/**
 * Puts the caret at the end of `field`. Returns false when the editor is no longer in the
 * document: a React-driven editor can replace its nodes between our reading the DOM and our
 * writing to it, and addRange() throws "The given range isn't in document" for a range whose
 * boundaries have been detached. Seen in the wild on chatgpt.com.
 */
function collapseCaretToEnd(field: HTMLElement, selection: Selection): boolean {
  if (!field.isConnected) return false;
  try {
    const range = document.createRange();
    range.selectNodeContents(field);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  } catch {
    return false;
  }
}

function insertIntoContentEditable(field: HTMLElement, text: string) {
  if (!field.isConnected) return;
  field.focus();
  const selection = window.getSelection();
  if (!selection) return;

  let caretInField = false;
  try {
    caretInField =
      selection.rangeCount > 0 && field.contains(selection.getRangeAt(0).commonAncestorContainer);
  } catch {
    caretInField = false;
  }
  if (!caretInField && !collapseCaretToEnd(field, selection)) return;

  // Deprecated but still the most broadly-compatible way to *synthetically* insert text into
  // contenteditable so that rich editors (which listen for real input/beforeinput events, not
  // direct DOM mutation) notice it and undo history stays intact. Chrome has no removal plans.
  try {
    if (document.execCommand('insertText', false, text)) return;
  } catch {
    // Fall through to the manual path below.
  }

  // Manual fallback. Every step can fail if the editor re-renders underneath us, so the whole
  // block is guarded: losing one insertion is acceptable, throwing out of the message handler
  // and taking the dictation session down with it is not.
  try {
    if (selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    // The editor may drop that node again immediately; only re-select it if it survived.
    if (node.isConnected) {
      range.setStartAfter(node);
      range.setEndAfter(node);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  } catch (error) {
    console.warn('[voice-to-text] editor rejected the insertion', error);
  }
}

/**
 * Writes dictation into one field, keeping the still-revising tail live.
 *
 * Recognition arrives in two forms: an interim tail that keeps being rewritten as the
 * engine changes its mind, and committed text that never changes again. A writer keeps
 * track of where the interim tail currently sits so it can be replaced in place, which is
 * what makes words appear as they are spoken instead of only when a segment finalizes.
 */
export interface FieldWriter {
  /** Show `text` as the (replaceable) tail at the insertion point. */
  setInterim(text: string): void;
  /** Replace the current tail with `text` and make it permanent. */
  commit(text: string): void;
  /** Forget the tracked tail without touching the field (session ended). */
  reset(): void;
}

function createInputWriter(field: HTMLInputElement | HTMLTextAreaElement): FieldWriter {
  // input[type=email] reports a null selectionStart and throws on setSelectionRange, so
  // those fields track the tail as a plain suffix instead of by caret offset.
  const caretAware = (() => {
    try {
      return field.selectionStart !== null;
    } catch {
      return false;
    }
  })();

  // A single-line <input> silently strips newlines from its value (verified in Chrome), so
  // a spoken "new line" would both vanish and desync our tail bookkeeping — what we think we
  // wrote would no longer match what the field holds. Write a space there instead.
  const singleLine = field instanceof HTMLInputElement;
  const sanitize = (text: string) => (singleLine ? text.replace(/[\r\n]+/g, ' ') : text);

  let anchor: number | null = null;
  let tail = '';
  let caretAfterWrite = -1;
  /**
   * Some editors rewrite the field's content on every `input` — Google Translate inserts its
   * own transliteration, ProseMirror-style editors normalise. Our tail is then no longer
   * there to replace, so the next interim gets appended instead, and the text runs away
   * ("ab" → "abab" → "ababc"…). Verified reproducible. When that is detected we stop writing
   * interim into this field and fall back to committing finals only, which such editors
   * handle fine.
   */
  let liveInterim = true;

  /**
   * Whether the tail we last wrote is still ours to replace.
   *
   * Matching the tail text at the anchor is not sufficient on its own: if the user keeps
   * typing after us, the old tail is still sitting there and we would happily overwrite it
   * at the wrong position, eating their text. The caret is the decisive signal — it stays
   * exactly where we left it while we are the only writer, and moves the moment the user
   * takes over.
   */
  const owned = () => {
    if (anchor === null || anchor + tail.length > field.value.length) return false;
    if (field.value.substr(anchor, tail.length) !== tail) return false;
    if (!caretAware) return anchor + tail.length === field.value.length;
    return field.selectionStart === caretAfterWrite && field.selectionEnd === caretAfterWrite;
  };

  const write = (text: string, commit: boolean) => {
    if (!owned()) {
      // The user moved or typed — start a fresh tail where they are, and leave whatever we
      // wrote before alone; it is their text now.
      anchor = caretAware ? (field.selectionStart ?? field.value.length) : field.value.length;
      tail = '';
    }
    const start = anchor as number;
    const before = field.value;
    const next = before.slice(0, start) + text + before.slice(start + tail.length);
    setNativeValue(field, next);
    const caret = start + text.length;
    if (caretAware) {
      try {
        field.setSelectionRange(caret, caret);
      } catch {
        // Some hosts reject programmatic selection; position tracking degrades, not breaks.
      }
    }
    field.dispatchEvent(new Event('input', { bubbles: true }));

    // Did the page keep what we just wrote? Checked for interim only: a commit that the host
    // transforms is still the user's text, but an interim we cannot replace next time is the
    // start of runaway duplication.
    if (!commit && field.value.substr(start, text.length) !== text) {
      liveInterim = false;
      setNativeValue(field, before); // take our now-unmanageable fragment back out
      field.dispatchEvent(new Event('input', { bubbles: true }));
      anchor = null;
      tail = '';
      caretAfterWrite = -1;
      return;
    }
    // Record where the caret actually ended up: a controlled component may reposition it in
    // its input handler, and believing our intended value would make us disown the tail.
    caretAfterWrite = caretAware ? (field.selectionStart ?? caret) : caret;
    if (commit) {
      anchor = caretAfterWrite;
      tail = '';
    } else {
      tail = text;
    }
  };

  return {
    // Skip no-op rewrites: every write re-fires `input` on the host page, and during
    // dictation that would run the site's own handlers dozens of times per second.
    setInterim: (text) => {
      if (!liveInterim) return;
      const next = sanitize(text);
      if (next !== tail || !owned()) write(next, false);
    },
    commit: (text) => write(sanitize(text), true),
    reset: () => {
      anchor = null;
      tail = '';
      caretAfterWrite = -1;
      liveInterim = true;
    },
  };
}

function createContentEditableWriter(field: HTMLElement): FieldWriter {
  // Rich editors (Gmail, Slack, …) reformat and re-parent nodes while you type, so tracking
  // a live tail and deleting it again risks eating the user's own text. Here we insert only
  // committed text. Nothing is lost: the engine flushes its un-finalized tail before any
  // session ends, so every spoken word still arrives — just at segment boundaries.
  return {
    setInterim: () => {},
    commit: (text) => insertIntoContentEditable(field, text),
    reset: () => {},
  };
}

export function createFieldWriter(field: EditableField): FieldWriter {
  return field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement
    ? createInputWriter(field)
    : createContentEditableWriter(field);
}
