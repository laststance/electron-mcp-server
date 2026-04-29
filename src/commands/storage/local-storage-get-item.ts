import { z } from 'zod';
import { executeInElectron } from '../../utils/electron-connection';
import { windowTargetFields } from '../shared/window-target';
import { defineCommand } from '../types';

const schema = z.object({
  ...windowTargetFields,
  key: z.string().min(1).describe('localStorage key to read.'),
});

/**
 * Read a single value from `localStorage`.
 *
 * Sentinels:
 * - `Item not found: <key>` — key absent (`getItem` returns null)
 * - `Storage unavailable: <reason>` — when the renderer denies access
 *   (e.g., privacy modes, file:// origins under stricter Electron settings)
 *
 * Returns the raw stored string for present keys (which may itself be
 * JSON-encoded — callers parse).
 */
export const localStorageGetItem = defineCommand({
  name: 'electron_local_storage_get_item',
  description:
    'Read a single key from localStorage. Returns the raw string or "Item not found: <key>". Returns "Storage unavailable" when the renderer blocks access.',
  schema,
  operationType: 'query',
  async execute(args, target) {
    const keyLiteral = JSON.stringify(args.key);

    const javascriptCode = `
      (function() {
        try {
          if (!window.localStorage) {
            return 'Storage unavailable: localStorage is null';
          }
          const value = window.localStorage.getItem(${keyLiteral});
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
