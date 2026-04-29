import { z } from 'zod';
import { executeInElectron } from '../../utils/electron-connection';
import { windowTargetFields } from '../shared/window-target';
import { defineCommand } from '../types';

const schema = z.object({
  ...windowTargetFields,
  key: z.string().min(1).describe('sessionStorage key to read.'),
});

/**
 * Read a single value from `sessionStorage`.
 *
 * `sessionStorage` is scoped per browsing-context lifetime (cleared on
 * window close), so callers using this for test isolation get clean state
 * automatically between Electron app restarts.
 *
 * Sentinels: same shape as `electron_local_storage_get_item`.
 */
export const sessionStorageGetItem = defineCommand({
  name: 'electron_session_storage_get_item',
  description:
    'Read a single key from sessionStorage. Returns the raw string or "Item not found: <key>".',
  schema,
  operationType: 'query',
  async execute(args, target) {
    const keyLiteral = JSON.stringify(args.key);

    const javascriptCode = `
      (function() {
        try {
          if (!window.sessionStorage) {
            return 'Storage unavailable: sessionStorage is null';
          }
          const value = window.sessionStorage.getItem(${keyLiteral});
          if (value === null) {
            return 'Item not found: ' + ${keyLiteral};
          }
          return value;
        } catch (e) {
          return 'Storage unavailable: ' + e.message;
        }
      })();
    `;

    return executeInElectron(javascriptCode, target);
  },
});
