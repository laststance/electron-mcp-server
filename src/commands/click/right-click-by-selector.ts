import { z } from 'zod';
import { executeInElectron, sendCDPMethod } from '../../utils/electron-connection';
import { containsDangerousContent, escapeJsString } from '../shared/escaping';
import { windowTargetFields } from '../shared/window-target';
import { defineCommand } from '../types';

const schema = z.object({
  ...windowTargetFields,
  selector: z.string().min(1).describe('CSS selector for the element to right-click.'),
});

/**
 * Right-click an element using CDP-level mouse events. Triggers native
 * context menus and handlers listening to `contextmenu` / `auxclick`.
 *
 * CDP requires `button: 'right'` and `buttons: 2` for the press; otherwise
 * Chromium ignores the event. The release matches with `buttons: 0`.
 */
export const rightClickBySelector = defineCommand({
  name: 'electron_right_click_by_selector',
  description:
    'Right-click an element by CSS selector using CDP mouse events. Triggers contextmenu and native context menu UI.',
  schema,
  operationType: 'command',
  async execute(args, target) {
    if (containsDangerousContent(args.selector)) {
      return 'Invalid selector: contains dangerous content';
    }

    const findExpr = `(function() {
      const el = document.querySelector(${escapeJsString(args.selector)});
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    })()`;

    const coordResult = await executeInElectron(findExpr, target);
    const coordMatch = coordResult.match(/\{[\s\S]*?"x":\s*([\d.]+)[\s\S]*?"y":\s*([\d.]+)/);
    if (!coordMatch) {
      return `Element not found: ${args.selector}`;
    }

    const clickX = Math.round(parseFloat(coordMatch[1]));
    const clickY = Math.round(parseFloat(coordMatch[2]));

    await sendCDPMethod(
      'Input.dispatchMouseEvent',
      {
        type: 'mousePressed',
        x: clickX,
        y: clickY,
        button: 'right',
        buttons: 2,
        clickCount: 1,
        pointerType: 'mouse',
      },
      target,
    );
    await sendCDPMethod(
      'Input.dispatchMouseEvent',
      {
        type: 'mouseReleased',
        x: clickX,
        y: clickY,
        button: 'right',
        buttons: 0,
        clickCount: 1,
        pointerType: 'mouse',
      },
      target,
    );

    return `✅ Right-clicked at (${clickX}, ${clickY}) on: ${args.selector}`;
  },
});
