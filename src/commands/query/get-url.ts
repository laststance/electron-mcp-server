import { executeInElectron } from '../../utils/electron-connection';
import { WindowTargetSchema } from '../shared/window-target';
import { defineCommand } from '../types';

const schema = WindowTargetSchema;

/** Returns `window.location.href` of the focused Electron renderer. */
export const getUrl = defineCommand({
  name: 'electron_get_url',
  description: 'Get the window.location.href of the focused Electron window.',
  schema,
  operationType: 'query',
  async execute(_args, target) {
    return executeInElectron('window.location.href', target);
  },
});
