import { z } from 'zod';
import { executeInElectron } from '../../utils/electron-connection';
import { windowTargetFields } from '../shared/window-target';
import { defineCommand } from '../types';

const schema = z.object({
  ...windowTargetFields,
});

/**
 * Read the current window scroll position and document scroll extents.
 *
 * Returns JSON `{ scrollX, scrollY, maxScrollX, maxScrollY }` so callers can
 * detect "scrolled to bottom" via `scrollY >= maxScrollY`.
 *
 * `maxScrollX/Y` are computed as `documentElement.scrollWidth/Height -
 * window.innerWidth/Height`, clamped to 0 for non-scrollable axes.
 */
export const getScrollPosition = defineCommand({
  name: 'electron_get_scroll_position',
  description:
    'Read window.scrollX/scrollY plus max scroll extents. Returns JSON {scrollX, scrollY, maxScrollX, maxScrollY}.',
  schema,
  operationType: 'query',
  async execute(_args, target) {
    const javascriptCode = `
      (function() {
        try {
          const root = document.documentElement;
          const maxScrollX = Math.max(0, root.scrollWidth - window.innerWidth);
          const maxScrollY = Math.max(0, root.scrollHeight - window.innerHeight);
          return JSON.stringify({
            scrollX: window.scrollX,
            scrollY: window.scrollY,
            maxScrollX: maxScrollX,
            maxScrollY: maxScrollY
          });
        } catch (e) {
          return 'Error reading scroll position: ' + e.message;
        }
      })();
    `;

    return executeInElectron(javascriptCode, target);
  },
});
