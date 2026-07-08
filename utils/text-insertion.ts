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

function insertIntoInputOrTextarea(field: HTMLInputElement | HTMLTextAreaElement, text: string) {
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? field.value.length;
  const newValue = field.value.slice(0, start) + text + field.value.slice(end);
  setNativeValue(field, newValue);
  const cursor = start + text.length;
  field.setSelectionRange(cursor, cursor);
  field.dispatchEvent(new Event('input', { bubbles: true }));
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

/** Inserts finalized recognition text at the current cursor position and leaves the cursor after it. */
export function insertTextAtCursor(field: EditableField, text: string) {
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
    insertIntoInputOrTextarea(field, text);
  } else {
    insertIntoContentEditable(field, text);
  }
}
