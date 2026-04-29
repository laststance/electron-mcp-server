import { z } from 'zod';
import { executeInElectron } from '../../utils/electron-connection';
import { windowTargetFields } from '../shared/window-target';
import { defineCommand } from '../types';

const schema = z.object({
  ...windowTargetFields,
  deltaX: z.number().int().default(0).describe('Horizontal pixels to scroll. Positive = right.'),
  deltaY: z.number().int().default(0).describe('Vertical pixels to scroll. Positive = down.'),
  behavior: z
    .enum(['auto', 'smooth'])
    .default('auto')
    .describe('Scroll behavior. "auto" jumps instantly; "smooth" animates.'),
});

/**
 * Scroll the window by a relative pixel offset using `window.scrollBy`.
 *
 * Returns the new scroll position so callers can verify the scroll landed
 * (e.g., bottoming out against `document.documentElement.scrollHeight`).
 */
export const scrollByPixels = defineCommand({
  name: 'electron_scroll_by_pixels',
  description:
    'Scroll the window by a pixel delta. Returns the new (scrollX, scrollY) so callers can verify movement.',
  schema,
  operationType: 'command',
  async execute(args, target) {
    const javascriptCode = `
      (function() {
        try {
          window.scrollBy({ left: ${args.deltaX}, top: ${args.deltaY}, behavior: ${JSON.stringify(args.behavior)} });
          return 'Scrolled by (' + ${args.deltaX} + ', ' + ${args.deltaY} + '), now at (' + window.scrollX + ', ' + window.scrollY + ')';
        } catch (e) {
          return 'Error scrolling: ' + e.message;
        }
      })();
    `;

    return executeInElectron(javascriptCode, target);
  },
});
