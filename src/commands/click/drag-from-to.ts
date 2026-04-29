import { z } from 'zod';
import { executeInElectron, sendCDPMethod } from '../../utils/electron-connection';
import { containsDangerousContent, escapeJsString } from '../shared/escaping';
import { windowTargetFields } from '../shared/window-target';
import { defineCommand } from '../types';

const INTERMEDIATE_MOVE_STEPS = 10;

const schema = z.object({
  ...windowTargetFields,
  fromSelector: z.string().min(1).describe('CSS selector for the drag source element.'),
  toSelector: z.string().min(1).describe('CSS selector for the drop target element.'),
});

/**
 * Drag from one element's center to another's center using CDP mouse events.
 *
 * Sequence:
 * 1. `mouseMoved` to source center
 * 2. `mousePressed` (left button)
 * 3. Several intermediate `mouseMoved` events to target (some libraries
 *    require movement progression to start a drag, not a teleport)
 * 4. `mouseReleased` over target
 *
 * Why intermediate moves: HTML5 drag-and-drop frameworks (react-dnd, dnd-kit)
 * track movement deltas to distinguish a click from a drag. A single jump
 * from source to target is often classified as a click and ignored.
 */
export const dragFromTo = defineCommand({
  name: 'electron_drag_from_to',
  description:
    'Drag from a source element to a target element using CDP mouse events. Includes intermediate moves so drag libraries (react-dnd, dnd-kit) recognize the gesture.',
  schema,
  operationType: 'command',
  async execute(args, target) {
    if (containsDangerousContent(args.fromSelector)) {
      return 'Invalid fromSelector: contains dangerous content';
    }
    if (containsDangerousContent(args.toSelector)) {
      return 'Invalid toSelector: contains dangerous content';
    }

    const findCoordsExpr = `(function() {
      const fromEl = document.querySelector(${escapeJsString(args.fromSelector)});
      const toEl = document.querySelector(${escapeJsString(args.toSelector)});
      if (!fromEl || !toEl) return null;
      const fromRect = fromEl.getBoundingClientRect();
      const toRect = toEl.getBoundingClientRect();
      if (fromRect.width === 0 || fromRect.height === 0) return null;
      if (toRect.width === 0 || toRect.height === 0) return null;
      return {
        fromX: fromRect.x + fromRect.width / 2,
        fromY: fromRect.y + fromRect.height / 2,
        toX: toRect.x + toRect.width / 2,
        toY: toRect.y + toRect.height / 2
      };
    })()`;

    const coordResult = await executeInElectron(findCoordsExpr, target);
    const coordMatch = coordResult.match(
      /"fromX":\s*([\d.]+)[\s\S]*?"fromY":\s*([\d.]+)[\s\S]*?"toX":\s*([\d.]+)[\s\S]*?"toY":\s*([\d.]+)/,
    );
    if (!coordMatch) {
      return `Drag elements not found: from="${args.fromSelector}" to="${args.toSelector}"`;
    }

    const fromX = Math.round(parseFloat(coordMatch[1]));
    const fromY = Math.round(parseFloat(coordMatch[2]));
    const toX = Math.round(parseFloat(coordMatch[3]));
    const toY = Math.round(parseFloat(coordMatch[4]));

    await sendCDPMethod(
      'Input.dispatchMouseEvent',
      { type: 'mouseMoved', x: fromX, y: fromY, button: 'none', pointerType: 'mouse' },
      target,
    );
    await sendCDPMethod(
      'Input.dispatchMouseEvent',
      {
        type: 'mousePressed',
        x: fromX,
        y: fromY,
        button: 'left',
        buttons: 1,
        clickCount: 1,
        pointerType: 'mouse',
      },
      target,
    );

    for (let stepIndex = 1; stepIndex <= INTERMEDIATE_MOVE_STEPS; stepIndex++) {
      const progress = stepIndex / INTERMEDIATE_MOVE_STEPS;
      const stepX = Math.round(fromX + (toX - fromX) * progress);
      const stepY = Math.round(fromY + (toY - fromY) * progress);
      await sendCDPMethod(
        'Input.dispatchMouseEvent',
        {
          type: 'mouseMoved',
          x: stepX,
          y: stepY,
          button: 'left',
          buttons: 1,
          pointerType: 'mouse',
        },
        target,
      );
    }

    await sendCDPMethod(
      'Input.dispatchMouseEvent',
      {
        type: 'mouseReleased',
        x: toX,
        y: toY,
        button: 'left',
        buttons: 0,
        clickCount: 1,
        pointerType: 'mouse',
      },
      target,
    );

    return `✅ Dragged from (${fromX}, ${fromY}) → (${toX}, ${toY}): "${args.fromSelector}" → "${args.toSelector}"`;
  },
});
