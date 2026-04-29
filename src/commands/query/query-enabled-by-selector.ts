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
    .describe('CSS selector for the form control to test for enabled state.'),
});

/**
 * Test whether a form control is enabled (i.e., not disabled).
 *
 * The `disabled` property only exists on form-associated elements (button,
 * input, select, textarea, fieldset, optgroup, option). For elements where
 * `disabled` is not a property, returns the sentinel
 * `Element has no disabled property: <selector>` so callers can distinguish
 * "not a form control" from a real true/false answer.
 *
 * Returns the literal string `'true'` or `'false'`.
 *
 * Sentinel: `Element not found: <selector>` when the selector matches nothing.
 */
export const queryEnabledBySelector = defineCommand({
  name: 'electron_query_enabled_by_selector',
  description:
    'Check whether a form control is enabled (returns "true"/"false"). Sentinels: "Element not found", "Element has no disabled property" for non-form elements.',
  schema,
  operationType: 'query',
  async execute(args, target) {
    if (containsDangerousContent(args.selector)) {
      return 'Invalid selector: contains dangerous content';
    }
    const escapedSelector = escapeJsString(args.selector);

    // Use :disabled instead of element.disabled so we also detect controls
    // disabled via an ancestor fieldset[disabled] — the property only reflects
    // the direct attribute, while the pseudo-class follows the form control's
    // effective state.
    const javascriptCode = `
      (function() {
        try {
          const element = document.querySelector(${escapedSelector});
          if (!element) {
            return 'Element not found: ' + ${escapedSelector};
          }
          if (!('disabled' in element)) {
            return 'Element has no disabled property: ' + ${escapedSelector};
          }
          return element.matches(':disabled') ? 'false' : 'true';
        } catch (e) {
          return 'Error querying enabled state: ' + e.message;
        }
      })();
    `;

    return executeInElectron(javascriptCode, target);
  },
});
