export type EditableField = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

const TEXT_INPUT_TYPES = new Set([
  'text',
  'search',
  'email',
  'url',
  'tel',
  'password',
]);

/**
 * Whether an element is something we can reasonably dictate into. Deliberately excludes
 * non-text input types (checkbox, range, color, number, ...) — inserting recognized speech
 * into e.g. a number input would silently fail (the native value setter rejects
 * non-numeric strings) or produce nonsense.
 */
export function isEditableField(el: Element | null): el is EditableField {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly;
  if (el instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(el.type) && !el.disabled && !el.readOnly;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  return false;
}
