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
    const findExpr = `(function() {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const search = ${escapeJsString(args.text)}.toLowerCase();
      while (walker.nextNode()) {
        if (walker.currentNode.textContent.trim().toLowerCase().includes(search)) {
          const el = walker.currentNode.parentElement;
          if (el) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
            }
          }
        }
      }
      return null;
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
