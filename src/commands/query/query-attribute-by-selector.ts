import { z } from 'zod';
import { executeInElectron } from '../../utils/electron-connection';
import { containsDangerousContent, escapeJsString } from '../shared/escaping';
import { windowTargetFields } from '../shared/window-target';
import { defineCommand } from '../types';

const schema = z.object({
  ...windowTargetFields,
  selector: z.string().min(1).describe('CSS selector for the element to read the attribute from.'),
  attributeName: z
    .string()
    .min(1)
    .describe('Name of the HTML attribute to read (e.g., "href", "data-id", "aria-label").'),
});

/**
 * Read an HTML attribute via `element.getAttribute(name)`.
 *
 * Sentinel returns:
 * - `Element not found: <selector>` when the selector matches nothing
 * - `Attribute not found: <name>` when the element has no such attribute
 *
 * Distinguishing these from a literal empty-string attribute lets callers
 * tell "missing" apart from "present but blank".
 */
export const queryAttributeBySelector = defineCommand({
  name: 'electron_query_attribute_by_selector',
  description:
    'Read an HTML attribute (e.g., href, data-*, aria-*) via getAttribute. Returns "Element not found" or "Attribute not found" sentinels for missing cases.',
  schema,
  operationType: 'query',
  async execute(args, target) {
    if (containsDangerousContent(args.selector)) {
      return 'Invalid selector: contains dangerous content';
    }
    if (containsDangerousContent(args.attributeName)) {
      return 'Invalid attributeName: contains dangerous content';
    }
    const escapedSelector = escapeJsString(args.selector);
    const escapedAttr = escapeJsString(args.attributeName);

    const javascriptCode = `
      (function() {
        try {
          const element = document.querySelector(${escapedSelector});
          if (!element) {
            return 'Element not found: ' + ${escapedSelector};
          }
          const value = element.getAttribute(${escapedAttr});
          if (value === null) {
            return 'Attribute not found: ' + ${escapedAttr};
          }
          return String(value);
        } catch (e) {
          return 'Error querying attribute: ' + e.message;
        }
      })();
    `;

    return executeInElectron(javascriptCode, target);
  },
});
