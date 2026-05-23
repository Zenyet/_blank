type ShortcutEvent = Pick<
  KeyboardEvent,
  "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "repeat" | "isComposing"
>;

export function isSearchShortcutKey(e: ShortcutEvent): boolean {
  if (e.altKey || e.shiftKey || e.repeat || e.isComposing) return false;
  if (e.key === "/" && !e.ctrlKey && !e.metaKey) return true;
  return e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey);
}

export function isPlainLetterKey(e: ShortcutEvent): boolean {
  return (
    /^[a-z]$/i.test(e.key) &&
    !e.altKey &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.repeat &&
    !e.isComposing
  );
}
