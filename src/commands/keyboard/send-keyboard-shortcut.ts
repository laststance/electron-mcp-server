import { z } from 'zod';
import { executeInElectron } from '../../utils/electron-connection';
import { windowTargetFields } from '../shared/window-target';
import { defineCommand } from '../types';

const schema = z.object({
  ...windowTargetFields,
  shortcut: z
    .string()
    .min(1)
    .describe(
      'Shortcut to send (e.g., "Ctrl+N", "Meta+S", "Enter", "Escape", "ArrowDown"). Modifiers: Ctrl, Shift, Alt, Meta/Cmd.',
    ),
});

const VALID_SPECIAL_KEYS = [
  'Enter',
  'Escape',
  'Tab',
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Backspace',
  'Delete',
  'Home',
  'End',
  'PageUp',
  'PageDown',
] as const;

const SPECIAL_KEY_CODES: Readonly<Record<string, string>> = {
  Enter: 'Enter',
  Escape: 'Escape',
  Tab: 'Tab',
  Space: 'Space',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
};

/**
 * Map a shortcut key part to the correct `KeyboardEvent.code` value.
 * @example
 * keyToCode('a')        // => 'KeyA'
 * keyToCode('1')        // => 'Digit1'
 * keyToCode('Enter')    // => 'Enter'
 */
function keyToCode(key: string): string {
  if (SPECIAL_KEY_CODES[key]) return SPECIAL_KEY_CODES[key];

  if (key.length === 1) {
    const upper = key.toUpperCase();
    if (upper >= 'A' && upper <= 'Z') return `Key${upper}`;
    if (upper >= '0' && upper <= '9') return `Digit${upper}`;
  }
  return `Key${key.toUpperCase()}`;
}

/** Translate a modifier name (case-insensitive) to its KeyboardEvent property. */
function modifierToProperty(modifier: string): string | null {
  switch (modifier.toLowerCase()) {
    case 'ctrl':
      return 'ctrlKey: true';
    case 'shift':
      return 'shiftKey: true';
    case 'alt':
      return 'altKey: true';
    case 'meta':
    case 'cmd':
      return 'metaKey: true';
    default:
      return null;
  }
}

/**
 * Dispatch a keyboard shortcut via a synthetic `KeyboardEvent('keydown')` on
 * `document`. Useful for app-level hotkeys that listen on document/window.
 *
 * For shortcuts targeting a specific element (e.g. typing into an input),
 * prefer `electron_fill_input`.
 */
export const sendKeyboardShortcut = defineCommand({
  name: 'electron_send_keyboard_shortcut',
  description:
    'Dispatch a keyboard shortcut (e.g., "Ctrl+N", "Enter") on document. Best for app-level hotkeys, not input typing.',
  schema,
  operationType: 'command',
  async execute(args, target) {
    const parts = args.shortcut.split('+').map((p) => p.trim());
    const keyPart = parts[parts.length - 1];
    const modifiers = parts.slice(0, -1);

    if (
      keyPart.length !== 1 &&
      !VALID_SPECIAL_KEYS.includes(keyPart as (typeof VALID_SPECIAL_KEYS)[number])
    ) {
      return `Invalid keyboard shortcut: ${args.shortcut}`;
    }

    const modifierProps = modifiers
      .map(modifierToProperty)
      .filter((p): p is string => p !== null)
      .join(', ');

    // Serialize user-controlled values via JSON.stringify so they cannot
    // break out of the string literal. Even though we validate that keyPart
    // is either a single character or a known special key, the entire
    // shortcut string is otherwise echoed back into the return message.
    const keyLiteral = JSON.stringify(keyPart);
    const codeLiteral = JSON.stringify(keyToCode(keyPart));
    const shortcutLiteral = JSON.stringify(args.shortcut);

    const javascriptCode = `
      (function() {
        try {
          const event = new KeyboardEvent('keydown', {
            key: ${keyLiteral},
            code: ${codeLiteral},
            ${modifierProps ? modifierProps + ',' : ''}
            bubbles: true,
            cancelable: true
          });
          document.dispatchEvent(event);
          return 'Keyboard shortcut sent: ' + ${shortcutLiteral};
        } catch (e) {
          return 'Error sending shortcut: ' + e.message;
        }
      })();
    `;

    return executeInElectron(javascriptCode, target);
  },
});
