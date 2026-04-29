import { z } from 'zod';
import { executeInElectron, sendCDPMethod } from '../../utils/electron-connection';
import { escapeJsString } from '../shared/escaping';
import { windowTargetFields } from '../shared/window-target';
import { defineCommand } from '../types';

const schema = z.object({
  ...windowTargetFields,
  selector: z.string().min(1).describe('CSS selector for the element to hover over.'),
});

/**
 * Hover at the center of the matched element using **CDP-level** mouse events.
 *
 * Why CDP and not just `dispatchEvent('mouseover')`:
 * - Radix UI Tooltip and similar libraries listen to the browser's native
 *   pointer tracking (`pointermove` synthesized from real OS-level mouse
 *   movement). Synthetic JS `MouseEvent` doesn't trigger them.
 * - `Input.dispatchMouseEvent` from CDP is the only thing that does.
 *
 * Two-step protocol:
 * 1. `Runtime.evaluate` to find element coords
 * 2. `Input.dispatchMouseEvent` with `type: 'mouseMoved'`
 */
export const hoverBySelector = defineCommand({
  name: 'electron_hover_by_selector',
  description:
    'Hover over element by CSS selector using CDP-level mouse events. Triggers tooltips/popovers that synthetic JS events miss (Radix UI, etc.).',
  schema,
  operationType: 'command',
  async execute(args, target) {
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

    const hoverX = Math.round(parseFloat(coordMatch[1]));
    const hoverY = Math.round(parseFloat(coordMatch[2]));

    await sendCDPMethod(
      'Input.dispatchMouseEvent',
      { type: 'mouseMoved', x: hoverX, y: hoverY, button: 'none', pointerType: 'mouse' },
      target,
    );

    return `✅ Hovered at (${hoverX}, ${hoverY}) on: ${args.selector}`;
  },
});
