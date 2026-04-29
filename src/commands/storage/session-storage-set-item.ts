import { z } from 'zod';
import { executeInElectron } from '../../utils/electron-connection';
import { windowTargetFields } from '../shared/window-target';
import { defineCommand } from '../types';

const schema = z.object({
  ...windowTargetFields,
  key: z.string().min(1).describe('sessionStorage key to write.'),
  value: z
    .string()
    .describe(
      'Value to store. sessionStorage stores strings only; pre-serialize objects with JSON.stringify.',
    ),
});

/**
 * Write a single value to `sessionStorage`.
 *
 * Use over `electron_local_storage_set_item` when the value should not
 * persist across app restarts (e.g., short-lived auth nonces, ephemeral UI
 * state needed only for the current run).
 */
export const sessionStorageSetItem = defineCommand({
  name: 'electron_session_storage_set_item',
  description:
    'Write a single key/value to sessionStorage. Value is stored verbatim; cleared on window close (unlike localStorage).',
  schema,
  operationType: 'command',
  async execute(args, target) {
    const keyLiteral = JSON.stringify(args.key);
    const valueLiteral = JSON.stringify(args.value);

    const javascriptCode = `
      (function() {
        try {
          if (!window.sessionStorage) {
            return 'Storage unavailable: sessionStorage is null';
          }
          window.sessionStorage.setItem(${keyLiteral}, ${valueLiteral});
          return 'Set sessionStorage: ' + ${keyLiteral};
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
