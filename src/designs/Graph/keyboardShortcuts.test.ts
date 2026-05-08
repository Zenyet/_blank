import { describe, expect, it } from 'vitest';
import { isPlainLetterKey, isSearchShortcutKey } from './keyboardShortcuts';

type Key = Parameters<typeof isSearchShortcutKey>[0];

function key(overrides: Partial<Key>): Key {
  return {
    key: '',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: false,
    ...overrides,
  };
}

describe('isSearchShortcutKey', () => {
  it('accepts slash without inserting it as text', () => {
    expect(isSearchShortcutKey(key({ key: '/' }))).toBe(true);
  });

  it('accepts Ctrl+K and Cmd+K', () => {
    expect(isSearchShortcutKey(key({ key: 'k', ctrlKey: true }))).toBe(true);
    expect(isSearchShortcutKey(key({ key: 'K', metaKey: true }))).toBe(true);
  });

  it('rejects modified, repeated, and composing keys', () => {
    expect(isSearchShortcutKey(key({ key: '/', shiftKey: true }))).toBe(false);
    expect(isSearchShortcutKey(key({ key: 'k' }))).toBe(false);
    expect(isSearchShortcutKey(key({ key: 'k', ctrlKey: true, altKey: true }))).toBe(false);
    expect(isSearchShortcutKey(key({ key: 'k', ctrlKey: true, repeat: true }))).toBe(false);
    expect(isSearchShortcutKey(key({ key: 'k', ctrlKey: true, isComposing: true }))).toBe(false);
  });
});

describe('isPlainLetterKey', () => {
  it('keeps bare letters available for type-to-search', () => {
    expect(isPlainLetterKey(key({ key: 'a' }))).toBe(true);
    expect(isPlainLetterKey(key({ key: 'A' }))).toBe(true);
  });

  it('does not treat shortcut chords as plain letters', () => {
    expect(isPlainLetterKey(key({ key: 'k', ctrlKey: true }))).toBe(false);
    expect(isPlainLetterKey(key({ key: 'k', metaKey: true }))).toBe(false);
  });
});
