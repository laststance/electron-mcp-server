import { z } from 'zod';
import { CLICK_BY_SELECTOR_RATE_LIMIT_MS } from '../../constants';
import { executeInElectron } from '../../utils/electron-connection';
import { containsDangerousContent, escapeJsString } from '../shared/escaping';
import { windowTargetFields } from '../shared/window-target';
import { defineCommand } from '../types';

const schema = z.object({
  ...windowTargetFields,
  selector: z
    .string()
    .min(1)
    .describe('CSS selector for the element to click (e.g., "button.submit", "#login")'),
});

/**
 * Click an element by CSS selector.
 *
 * Replaces the old `click_button` subcommand (T14) — `click_button` defaulted
 * the selector to `'button'` and polluted `window[mcp_click_*]` with rate-limit
 * markers plus a `pointerEvents` hack. This command keeps a lightweight
 * `CLICK_BY_SELECTOR_RATE_LIMIT_MS` debounce (`window[mcp_selector_click_*]`)
 * but drops the worst of those workarounds; callers needing the old behavior
 * should pass an explicit selector like `'button'`.
 *
 * ⚠️ Rate-limit: same-selector clicks fired within
 * `CLICK_BY_SELECTOR_RATE_LIMIT_MS` of the previous one are rejected with
 * `"Click prevented - too soon after previous click"`. Serialize click flows
 * (await each call) to avoid this — parallel rapid clicks on the same target
 * are intentionally suppressed to prevent double-submits in React handlers.
 */
export const clickBySelector = defineCommand({
  name: 'electron_click_by_selector',
  description:
    'Click an element by CSS selector. Returns the element tag/text on success. Note: same-selector clicks within ~1s are rate-limited and return "Click prevented - too soon after previous click" — serialize calls (await each) to avoid this. Replaces the deprecated click_button — pass selector="button" to keep that behavior.',
  schema,
  operationType: 'command',
  async execute(args, target) {
    if (containsDangerousContent(args.selector)) {
      return 'Invalid selector: contains dangerous content';
    }
    const escapedSelector = escapeJsString(args.selector);

    const javascriptCode = `
      (function() {
        try {
          const element = document.querySelector(${escapedSelector});
          if (element) {
            const rect = element.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) {
              return 'Element not visible';
            }

            const clickKey = 'mcp_selector_click_' + btoa(${escapedSelector}).slice(0, 10);
            if (window[clickKey] && Date.now() - window[clickKey] < ${CLICK_BY_SELECTOR_RATE_LIMIT_MS}) {
              return 'Click prevented - too soon after previous click';
            }
            window[clickKey] = Date.now();

            element.focus();
            const event = new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              view: window
            });
            element.dispatchEvent(event);

            return 'Successfully clicked element: ' + element.tagName +
                   (element.textContent ? ' - "' + element.textContent.substring(0, 50) + '"' : '');
          }
          return 'Element not found: ' + ${escapedSelector};
        } catch (e) {
          return 'Error clicking element: ' + e.message;
        }
      })();
    `;

    return executeInElectron(javascriptCode, target);
  },
});
