import { z } from 'zod';
import { executeInElectron } from '../../utils/electron-connection';
import { containsDangerousContent, escapeJsString } from '../shared/escaping';
import { windowTargetFields } from '../shared/window-target';
import { defineCommand } from '../types';

const schema = z.object({
  ...windowTargetFields,
  selector: z.string().min(1).describe('CSS selector for the element whose text content to read.'),
});

/**
 * Read `element.textContent` for the first element matching the selector.
 *
 * Returns the text as a plain string (formatted by `executeInElectron` as
 * `✅ Command executed: <text>`). When the element is not found, returns
 * `Element not found: <selector>` so callers can distinguish missing vs empty.
 */
export const queryTextBySelector = defineCommand({
  name: 'electron_query_text_by_selector',
  description:
    'Read textContent of the first element matching the CSS selector. Returns "Element not found: <selector>" if no match.',
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
          return element.textContent === null ? '' : String(element.textContent);
        } catch (e) {
          return 'Error querying text: ' + e.message;
        }
      })();
    `;

    return executeInElectron(javascriptCode, target);
  },
});
