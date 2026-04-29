import { z } from 'zod';
import { executeInElectron } from '../../utils/electron-connection';
import { windowTargetFields } from '../shared/window-target';
import { defineCommand } from '../types';

const schema = z.object({
  ...windowTargetFields,
});

/**
 * Read the renderer's viewport size and devicePixelRatio.
 *
 * Returns a JSON object: `{ width, height, devicePixelRatio }`.
 * Use this to size screenshots, plan scroll distance, or detect HiDPI.
 */
export const getViewportSize = defineCommand({
  name: 'electron_get_viewport_size',
  description:
    'Read viewport innerWidth/innerHeight and devicePixelRatio. Returns JSON {width, height, devicePixelRatio}.',
  schema,
  operationType: 'query',
  async execute(_args, target) {
    const javascriptCode = `
      (function() {
        try {
          return JSON.stringify({
            width: window.innerWidth,
            height: window.innerHeight,
            devicePixelRatio: window.devicePixelRatio
          });
        } catch (e) {
          return 'Error reading viewport: ' + e.message;
        }
      })();
    `;

    return executeInElectron(javascriptCode, target);
  },
});
