import { z } from 'zod';
import { executeInElectron, sendCDPMethod } from '../../utils/electron-connection';
import { containsDangerousContent, escapeJsString } from '../shared/escaping';
import { windowTargetFields } from '../shared/window-target';
import { defineCommand } from '../types';

const schema = z.object({
  ...windowTargetFields,
  selector: z.string().min(1).describe('CSS selector for the element to double-click.'),
});

/**
 * Double-click an element using CDP-level mouse events.
 *
 * Why CDP and not synthetic `dblclick`:
 * - Many editors/UI libraries (Monaco, slate.js, custom canvas widgets) listen
 *   to the OS-level mouse stream surfaced via `Input.dispatchMouseEvent`.
 *   A synthetic `dblclick` event won't trigger their handlers.
 *
 * Sequence (CDP convention for double-click):
 * 1. `mousePressed` with `clickCount: 1`
 * 2. `mouseReleased` with `clickCount: 1`
 * 3. `mousePressed` with `clickCount: 2`
 * 4. `mouseReleased` with `clickCount: 2`
 */
export const doubleClickBySelector = defineCommand({
  name: 'electron_double_click_by_selector',
  description:
    'Double-click an element by CSS selector using CDP mouse events. Triggers handlers that synthetic dblclick misses (Monaco, canvas, etc.).',
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

    const baseEvent = {
      x: clickX,
      y: clickY,
      button: 'left',
      pointerType: 'mouse',
    };

    // CDP requires `buttons` to be a bitmask of currently-pressed buttons —
    // 1 while the left button is down, 0 once it's released. Some renderers
    // (e.g. WebKit-derived widgets) ignore mouse events that omit it.
    await sendCDPMethod(
      'Input.dispatchMouseEvent',
      { ...baseEvent, type: 'mousePressed', clickCount: 1, buttons: 1 },
      target,
    );
    await sendCDPMethod(
      'Input.dispatchMouseEvent',
      { ...baseEvent, type: 'mouseReleased', clickCount: 1, buttons: 0 },
      target,
    );
    await sendCDPMethod(
      'Input.dispatchMouseEvent',
      { ...baseEvent, type: 'mousePressed', clickCount: 2, buttons: 1 },
      target,
    );
    await sendCDPMethod(
      'Input.dispatchMouseEvent',
      { ...baseEvent, type: 'mouseReleased', clickCount: 2, buttons: 0 },
      target,
    );

    return `✅ Double-clicked at (${clickX}, ${clickY}) on: ${args.selector}`;
  },
});
