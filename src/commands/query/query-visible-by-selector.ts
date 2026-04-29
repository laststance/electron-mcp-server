import { z } from 'zod';
import { executeInElectron } from '../../utils/electron-connection';
import { containsDangerousContent, escapeJsString } from '../shared/escaping';
import { windowTargetFields } from '../shared/window-target';
import { defineCommand } from '../types';

const schema = z.object({
  ...windowTargetFields,
  selector: z.string().min(1).describe('CSS selector for the element to test for visibility.'),
});

/**
 * Test whether an element is visually rendered.
 *
 * "Visible" here means all of:
 * - It exists in the DOM
 * - Its bounding rect has non-zero width and height
 * - `getComputedStyle` reports `display !== 'none'`
 * - `visibility !== 'hidden'` and `visibility !== 'collapse'`
 * - `opacity > 0`
 *
 * Returns the string `'true'` or `'false'` (the MCP response format is plain
 * text, so callers compare against the literal string).
 *
 * Sentinel: `Element not found: <selector>` when the selector matches nothing.
 */
export const queryVisibleBySelector = defineCommand({
  name: 'electron_query_visible_by_selector',
  description:
    'Check whether an element is visually rendered (non-zero size, display !== none, visibility !== hidden, opacity > 0). Returns "true"/"false" or "Element not found".',
  schema,
  operationType: 'query',
  async execute(args, target) {
    if (containsDangerousContent(args.selector)) {
      return 'Invalid selector: contains dangerous content';
    }
    const escapedSelector = escapeJsString(args.selector);

    const javascriptCode = `
      (function() {
        try {
          const element = document.querySelector(${escapedSelector});
          if (!element) {
            return 'Element not found: ' + ${escapedSelector};
          }
          const rect = element.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) {
            return 'false';
          }
          const style = window.getComputedStyle(element);
          if (style.display === 'none') return 'false';
          if (style.visibility === 'hidden' || style.visibility === 'collapse') return 'false';
          const opacity = parseFloat(style.opacity);
          if (!isNaN(opacity) && opacity <= 0) return 'false';
          return 'true';
        } catch (e) {
          return 'Error querying visibility: ' + e.message;
        }
      })();
    `;

    return executeInElectron(javascriptCode, target);
  },
});
