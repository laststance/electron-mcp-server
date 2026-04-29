import { executeInElectron } from '../../utils/electron-connection';
import { WindowTargetSchema } from '../shared/window-target';
import { defineCommand } from '../types';

const schema = WindowTargetSchema;

/**
 * Returns `document.title` of the focused Electron renderer.
 * Trivial read-only DOM query.
 */
export const getTitle = defineCommand({
  name: 'electron_get_title',
  description:
    'Get the document.title of the focused Electron window. Read-only; safe in any security profile.',
  schema,
  operationType: 'query',
  async execute(_args, target) {
    return executeInElectron('document.title', target);
  },
});
