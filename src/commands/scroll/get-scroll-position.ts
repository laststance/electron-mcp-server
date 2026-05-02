import { z } from 'zod';
import { executeInElectron } from '../../utils/electron-connection';
import { containsDangerousContent, escapeJsString } from '../shared/escaping';
import { windowTargetFields } from '../shared/window-target';
import { defineCommand } from '../types';

const schema = z.object({
  ...windowTargetFields,
  selector: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Optional CSS selector. When provided, returns scroll metrics for that element (overflow:auto / overflow:scroll viewport). Omit to read window scroll.',
    ),
});

/**
 * Read scroll position and extents for either the document or a specific
 * scrollable element.
 *
 * - Without `selector`: returns `window.scrollX/scrollY` and document
 *   `documentElement.scrollWidth/Height - window.innerWidth/Height` (clamped
 *   to 0 for non-scrollable axes).
 * - With `selector`: returns `el.scrollLeft/scrollTop` and
 *   `el.scrollWidth/Height - el.clientWidth/Height` so callers can detect
 *   inner-viewport "scrolled to bottom" without falling back to `eval`.
 *
 * Mirrors the precedence already accepted by `electron_scroll_to_element` /
 * `electron_scroll_by_pixels` (which take an optional selector) — fixes #16
 * where the selector argument was silently stripped.
 */
export const getScrollPosition = defineCommand({
  name: 'electron_get_scroll_position',
  description:
    'Read scroll metrics for the window (default) or an element matching `selector`. Returns JSON {scrollX, scrollY, maxScrollX, maxScrollY}; element variants source the values from el.scrollLeft / scrollTop / scrollWidth - clientWidth / scrollHeight - clientHeight.',
  schema,
  operationType: 'query',
  async execute(args, target) {
    if (args.selector !== undefined && containsDangerousContent(args.selector)) {
      return JSON.stringify({ error: 'Invalid selector: contains dangerous content' });
    }

    const selectorLiteral = args.selector === undefined ? 'null' : escapeJsString(args.selector);

    const javascriptCode = `
      (function() {
        try {
          const selector = ${selectorLiteral};
          if (selector === null) {
            const root = document.documentElement;
            const maxScrollX = Math.max(0, root.scrollWidth - window.innerWidth);
            const maxScrollY = Math.max(0, root.scrollHeight - window.innerHeight);
            return JSON.stringify({
              scrollX: window.scrollX,
              scrollY: window.scrollY,
              maxScrollX: maxScrollX,
              maxScrollY: maxScrollY
            });
          }
          const element = document.querySelector(selector);
          if (!element) {
            return JSON.stringify({ error: 'Element not found: ' + selector });
          }
          // Use scrollLeft/scrollTop for inner viewport; subtract clientWidth/Height
          // (not innerWidth/Height) so the result reflects the visible area of the
          // scrollable container itself, not the document viewport.
          const maxScrollX = Math.max(0, element.scrollWidth - element.clientWidth);
          const maxScrollY = Math.max(0, element.scrollHeight - element.clientHeight);
          return JSON.stringify({
            scrollX: element.scrollLeft,
            scrollY: element.scrollTop,
            maxScrollX: maxScrollX,
            maxScrollY: maxScrollY
          });
        } catch (e) {
          return JSON.stringify({ error: 'Error reading scroll position: ' + e.message });
        }
      })();
    `;

    return executeInElectron(javascriptCode, target);
  },
});
