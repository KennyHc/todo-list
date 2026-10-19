/** Elements that own the keyboard: their key and touch events must not trigger row gestures. */
const TEXT_ENTRY = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

export const isTextEntryTarget = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest(TEXT_ENTRY) !== null;

/**
 * Wraps dnd-kit activator listeners so events that start inside a text field are ignored.
 * Without this, on touch (where the whole row is the activator) the KeyboardSensor would start
 * a drag on Space and swallow it, and a long press in the field would lift the row.
 */
export function ignoreTextEntry<T extends object | undefined>(listeners: T): T {
  if (!listeners) return listeners;
  const wrapped: Record<string, (event: { target: EventTarget | null }) => void> = {};
  for (const [name, handler] of Object.entries(listeners as Record<string, unknown>)) {
    if (typeof handler !== 'function') continue;
    wrapped[name] = (event) => {
      if (isTextEntryTarget(event.target)) return;
      (handler as (e: unknown) => void)(event);
    };
  }
  return wrapped as unknown as T;
}
