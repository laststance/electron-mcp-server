import { executeInElectron } from '../../utils/electron-connection';
import { generateFindElementsCommand } from '../../utils/electron-commands';
import { WindowTargetSchema } from '../shared/window-target';
import { defineCommand } from '../types';

const schema = WindowTargetSchema;

/**
 * Deep DOM analysis: categorizes interactive elements (buttons, inputs, links,
 * images, headings, containers) and returns a JSON payload with selector,
 * xpath, position, and styling per element.
 *
 * Generated JS lives in `utils/electron-commands.ts` because it's >200 lines
 * and gets reused by Phase 7 testing utilities.
 */
export const findElements = defineCommand({
  name: 'electron_find_elements',
  description:
    'Analyze all interactive elements (buttons, inputs, selects, links) on the page with their properties, positions, and selectors. Returns JSON.',
  schema,
  operationType: 'query',
  async execute(_args, target) {
    return executeInElectron(generateFindElementsCommand(), target);
  },
});
