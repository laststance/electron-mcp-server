import { z } from 'zod';
import { executeInElectron } from '../../utils/electron-connection';
import { containsDangerousContent, escapeJsString } from '../shared/escaping';
import { windowTargetFields } from '../shared/window-target';
import { defineCommand } from '../types';

const schema = z.object({
  ...windowTargetFields,
  selector: z.string().min(1).describe('CSS selector for the element to scroll into view.'),
  behavior: z
    .enum(['auto', 'smooth'])
    .default('auto')
    .describe('Scroll behavior. "auto" jumps instantly; "smooth" animates.'),
  block: z
    .enum(['start', 'center', 'end', 'nearest'])
    .default('center')
    .describe('Vertical alignment of the element after scrolling.'),
});

/**
 * Scroll an element into view via `element.scrollIntoView`.
 *
 * Default `block: 'center'` (rather than the spec default `'start'`) because
 * UI testing typically wants the element comfortably in the viewport, not
 * pinned to the top edge where it might be obscured by sticky headers.
 *
 * Sentinel: `Element not found: <selector>` when the selector matches nothing.
 */
export const scrollToElement = defineCommand({
  name: 'electron_scroll_to_element',
  description:
    'Scroll an element into view via scrollIntoView. Defaults to block:center so sticky headers do not obscure it.',
  schema,
  operationType: 'command',
  async execute(args, target) {
    if (containsDangerousContent(args.selector)) {
      return 'Invalid selector: contains dangerous content';
    }
    const escapedSelector = escapeJsString(args.selector);
    const behaviorLiteral = JSON.stringify(args.behavior);
    const blockLiteral = JSON.stringify(args.block);

    const javascriptCode = `
      (function() {
        try {
          const element = document.querySelector(${escapedSelector});
          if (!element) {
            return 'Element not found: ' + ${escapedSelector};
          }
          element.scrollIntoView({ behavior: ${behaviorLiteral}, block: ${blockLiteral} });
          return 'Scrolled to: ' + ${escapedSelector};
        } catch (e) {
          return 'Error scrolling: ' + e.message;
        }
      })();
    `;

    return executeInElectron(javascriptCode, target);
  },
});
