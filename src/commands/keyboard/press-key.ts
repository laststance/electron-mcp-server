import { z } from 'zod';
import { sendCDPMethod } from '../../utils/electron-connection';
import { windowTargetFields } from '../shared/window-target';
import { defineCommand } from '../types';

const schema = z.object({
  ...windowTargetFields,
  key: z
    .string()
    .min(1)
    .describe(
      'Key to press (e.g., "a", "Enter", "ArrowDown", "Backspace"). Single chars or special key names.',
    ),
  modifiers: z
    .array(z.enum(['Ctrl', 'Shift', 'Alt', 'Meta']))
    .optional()
    .describe('Modifier keys held during the press.'),
});

const SPECIAL_KEY_TO_CODE: Readonly<Record<string, string>> = {
  Enter: 'Enter',
  Escape: 'Escape',
  Tab: 'Tab',
  Space: 'Space',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
};

/**
 * Map a key name to a `KeyboardEvent.code`. Used so CDP's `keyDown`/`keyUp`
 * events match what the renderer expects.
 * @example
 * resolveKeyCode('a')        // => 'KeyA'
 * resolveKeyCode('1')        // => 'Digit1'
 * resolveKeyCode('Enter')    // => 'Enter'
 */
function resolveKeyCode(key: string): string {
  if (SPECIAL_KEY_TO_CODE[key]) return SPECIAL_KEY_TO_CODE[key];
  // A literal space character has KeyboardEvent.code 'Space', not ' '.
  if (key === ' ') return 'Space';
  if (key.length === 1) {
    const upper = key.toUpperCase();
    if (upper >= 'A' && upper <= 'Z') return `Key${upper}`;
    if (upper >= '0' && upper <= '9') return `Digit${upper}`;
  }
  return key;
}

const MODIFIER_BIT: Readonly<Record<'Alt' | 'Ctrl' | 'Meta' | 'Shift', number>> = {
  Alt: 1,
  Ctrl: 2,
  Meta: 4,
  Shift: 8,
};

/**
 * Press a single key (with optional modifiers) using CDP `Input.dispatchKeyEvent`.
 *
 * Why CDP and not synthetic `KeyboardEvent`:
 * - Native input handling (textarea cursor movement, IME composition, app-level
 *   accelerators) responds to the OS-level key stream that CDP feeds, not to
 *   `dispatchEvent(new KeyboardEvent(...))`.
 *
 * For shortcuts targeted at `document` (e.g. global hotkeys), prefer
 * `electron_send_keyboard_shortcut`, which uses synthetic events and is
 * cheaper. Use this when you need a key event the renderer treats as real
 * keyboard input.
 */
export const pressKey = defineCommand({
  name: 'electron_press_key',
  description:
    'Press a single key with optional modifiers via CDP. Use this for real keyboard input (cursor moves, IME) — for app hotkeys prefer electron_send_keyboard_shortcut.',
  schema,
  operationType: 'command',
  async execute(args, target) {
    const code = resolveKeyCode(args.key);
    const modifierMask = (args.modifiers ?? []).reduce(
      (mask, modifier) => mask | MODIFIER_BIT[modifier],
      0,
    );

    // Per CDP guidance: omit text/unmodifiedText (use rawKeyDown) when a
    // non-shift modifier is held, otherwise the renderer inserts the
    // character alongside the shortcut action. Shift on its own is fine —
    // it just produces uppercase. See:
    // https://chromedevtools.github.io/devtools-protocol/tot/Input/
    const hasNonShiftModifier = (args.modifiers ?? []).some(
      (modifier) => modifier === 'Ctrl' || modifier === 'Alt' || modifier === 'Meta',
    );
    const isPrintable =
      args.key.length === 1 && !SPECIAL_KEY_TO_CODE[args.key] && !hasNonShiftModifier;

    await sendCDPMethod(
      'Input.dispatchKeyEvent',
      {
        type: isPrintable ? 'keyDown' : 'rawKeyDown',
        key: args.key,
        code,
        modifiers: modifierMask,
        ...(isPrintable ? { text: args.key, unmodifiedText: args.key } : {}),
      },
      target,
    );
    await sendCDPMethod(
      'Input.dispatchKeyEvent',
      {
        type: 'keyUp',
        key: args.key,
        code,
        modifiers: modifierMask,
      },
      target,
    );

    const modifierLabel =
      args.modifiers && args.modifiers.length > 0 ? `${args.modifiers.join('+')}+` : '';
    return `✅ Pressed key: ${modifierLabel}${args.key}`;
  },
});
