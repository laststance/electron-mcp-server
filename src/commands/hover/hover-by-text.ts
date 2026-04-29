import { z } from 'zod';
import { executeInElectron, sendCDPMethod } from '../../utils/electron-connection';
import { escapeJsString } from '../shared/escaping';
import { windowTargetFields } from '../shared/window-target';
import { defineCommand } from '../types';

const schema = z.object({
  ...windowTargetFields,
  text: z
    .string()
    .min(1)
    .describe('Visible text substring (case-insensitive) of the element to hover over.'),
});

/**
 * Like `hover_by_selector` but locates the element by visible text via a
 * `TreeWalker` over `document.body`. See `hover-by-selector.ts` for why CDP
 * mouse events are required for native pointer-tracking listeners.
 */
export const hoverByText = defineCommand({
  name: 'electron_hover_by_text',
  description:
    'Hover over element by visible text using CDP-level mouse events. Triggers tooltips/popovers that synthetic JS events miss.',
  schema,
  operationType: 'command',
  async execute(args, target) {
    // Walk elements and check the aggregated textContent so split markup like
    // <span>Sign</span><span>in</span> still matches "Sign in". Picking the
    // element with the shortest textContent acts as a most-specific match
    // — outermost ancestors (body, main) almost always contain the search
    // string but are not the click target the user wants.
    const findExpr = `(function() {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
      const search = ${escapeJsString(args.text)}.toLowerCase();
      let best = null;
      let bestLength = Infinity;
      while (walker.nextNode()) {
        const el = walker.currentNode;
        const text = (el.textContent || '').trim().toLowerCase();
        if (!text.includes(search)) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (text.length < bestLength) {
          best = rect;
          bestLength = text.length;
        }
      }
      if (!best) return null;
      return { x: best.x + best.width / 2, y: best.y + best.height / 2 };
    })()`;

    const coordResult = await executeInElectron(findExpr, target);
    const coordMatch = coordResult.match(/\{[\s\S]*?"x":\s*([\d.]+)[\s\S]*?"y":\s*([\d.]+)/);
    if (!coordMatch) {
      return `Element not found: ${args.text}`;
    }

    const hoverX = Math.round(parseFloat(coordMatch[1]));
    const hoverY = Math.round(parseFloat(coordMatch[2]));

    await sendCDPMethod(
      'Input.dispatchMouseEvent',
      { type: 'mouseMoved', x: hoverX, y: hoverY, button: 'none', pointerType: 'mouse' },
      target,
    );

    return `✅ Hovered at (${hoverX}, ${hoverY}) on: ${args.text}`;
  },
});
