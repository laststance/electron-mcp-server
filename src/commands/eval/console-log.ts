import { z } from 'zod';
import { executeInElectron } from '../../utils/electron-connection';
import { escapeJsString } from '../shared/escaping';
import { windowTargetFields } from '../shared/window-target';
import { defineCommand } from '../types';

const schema = z.object({
  ...windowTargetFields,
  message: z
    .string()
    .default('Hello from MCP!')
    .describe('Message to log via console.log in the renderer.'),
});

/**
 * Logs a message to the renderer's console. Useful for sanity checks during
 * test runs and for asserting that a command actually reached the right window.
 */
export const consoleLog = defineCommand({
  name: 'electron_console_log',
  description: 'Emit a message via console.log in the renderer. Useful for test sanity checks.',
  schema,
  operationType: 'command',
  async execute(args, target) {
    const javascriptCode = `console.log('MCP Command:', ${escapeJsString(args.message)}); 'Console message sent'`;
    return executeInElectron(javascriptCode, target);
  },
});
