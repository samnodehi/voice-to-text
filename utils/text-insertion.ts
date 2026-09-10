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

function insertIntoContentEditable(field: HTMLElement, text: string) {
  field.focus();
  const selection = window.getSelection();
  if (!selection) return;

  if (selection.rangeCount === 0 || !field.contains(selection.getRangeAt(0).commonAncestorContainer)) {
    // No existing cursor inside this field (e.g. very first insert) — place one at the end.
    const range = document.createRange();
    range.selectNodeContents(field);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  // Deprecated but still the most broadly-compatible way to *synthetically* insert text into
  // contenteditable so that rich editors (which listen for real input/beforeinput events, not
  // direct DOM mutation) notice it and undo history stays intact. Chrome has no removal plans.
  const handled = document.execCommand('insertText', false, text);
  if (handled) return;

  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.setEndAfter(node);
  selection.removeAllRanges();
  selection.addRange(range);
  field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
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

  let anchor: number | null = null;
  let tail = '';
  let caretAfterWrite = -1;

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
    const next = field.value.slice(0, start) + text + field.value.slice(start + tail.length);
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
      if (text !== tail || !owned()) write(text, false);
    },
    commit: (text) => write(text, true),
    reset: () => {
      anchor = null;
      tail = '';
      caretAfterWrite = -1;
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
