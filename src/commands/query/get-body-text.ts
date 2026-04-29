import { executeInElectron } from '../../utils/electron-connection';
import { WindowTargetSchema } from '../shared/window-target';
import { defineCommand } from '../types';

const schema = WindowTargetSchema;

/**
 * Returns the first 500 characters of `document.body.innerText`.
 * Cap exists to keep the MCP response payload bounded.
 */
export const getBodyText = defineCommand({
  name: 'electron_get_body_text',
  description: 'Get the first 500 chars of document.body.innerText (truncated for payload size).',
  schema,
  operationType: 'query',
  async execute(_args, target) {
    return executeInElectron('(document.body?.innerText ?? "").substring(0, 500)', target);
  },
});
