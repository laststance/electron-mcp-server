import { z } from 'zod';
import { executeInElectron } from '../../utils/electron-connection';
import { windowTargetFields } from '../shared/window-target';
import { defineCommand } from '../types';

const schema = z.object({
  ...windowTargetFields,
  key: z.string().min(1).describe('localStorage key to write.'),
  value: z
    .string()
    .describe(
      'Value to store. localStorage stores strings only; pre-serialize objects with JSON.stringify.',
    ),
});

/**
 * Write a single value to `localStorage`.
 *
 * `value` is taken verbatim — `localStorage` only stores strings, so
 * callers needing structured data must `JSON.stringify` first.
 *
 * Errors:
 * - `Storage quota exceeded: <message>` when the renderer rejects the
 *   write (DOMException: QuotaExceededError)
 */
export const localStorageSetItem = defineCommand({
  name: 'electron_local_storage_set_item',
  description:
    'Write a single key/value to localStorage. Value is stored verbatim; pre-serialize objects with JSON.stringify.',
  schema,
  operationType: 'command',
  async execute(args, target) {
    const keyLiteral = JSON.stringify(args.key);
    const valueLiteral = JSON.stringify(args.value);

    const javascriptCode = `
      (function() {
        try {
          if (!window.localStorage) {
            return 'Storage unavailable: localStorage is null';
          }
          window.localStorage.setItem(${keyLiteral}, ${valueLiteral});
          return 'Set localStorage: ' + ${keyLiteral};
        } catch (e) {
          if (e && e.name === 'QuotaExceededError') {
            return 'Storage quota exceeded: ' + e.message;
          }
          return 'Storage error: ' + e.message;
        }
      })();
    `;

    return executeInElectron(javascriptCode, target);
  },
});
