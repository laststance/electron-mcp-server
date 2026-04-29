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
    .describe('CSS selector for the input/textarea/select to read the value from.'),
});

/**
 * Read `element.value` for form elements (input, textarea, select).
 *
 * Sentinel returns:
 * - `Element not found: <selector>` when the selector matches nothing
 * - `Element has no value property: <selector>` when matched element is not a
 *   form control (e.g., a `<div>`)
 *
 * Returns the empty string for cleared inputs (distinguishable from the
 * "no value property" case via the sentinel).
 */
export const queryValueBySelector = defineCommand({
  name: 'electron_query_value_by_selector',
  description:
    'Read the .value of an input, textarea, or select. Returns "Element not found" or "Element has no value property" sentinels for missing/non-form cases.',
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
          if (!('value' in element)) {
            return 'Element has no value property: ' + ${escapedSelector};
          }
          const value = element.value;
          return value === null || value === undefined ? '' : String(value);
        } catch (e) {
          return 'Error querying value: ' + e.message;
        }
      })();
    `;

    return executeInElectron(javascriptCode, target);
  },
});
