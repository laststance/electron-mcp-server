import { z } from 'zod';
import { executeInElectron } from '../../utils/electron-connection';
import { generateSelectOptionCommand } from '../../utils/electron-input-commands';
import { windowTargetFields } from '../shared/window-target';
import { defineCommand } from '../types';

const schema = z
  .object({
    ...windowTargetFields,
    value: z.string().min(1).describe('Option value or option text content to select. Required.'),
    selector: z
      .string()
      .optional()
      .describe('CSS selector for the <select> element. Pass either selector or text.'),
    text: z
      .string()
      .optional()
      .describe(
        'Label text adjacent to the <select> to identify it (used when selector is omitted).',
      ),
  })
  .refine((args) => Boolean(args.selector || args.text), {
    message: 'Either `selector` or `text` must be provided to identify the <select>.',
  });

/**
 * Select an option in a `<select>` by value or visible option text.
 * Locates the select via CSS selector, or falls back to a `<label for="...">`
 * text match. Dispatches React-compatible `change` and `input` events.
 */
export const selectOption = defineCommand({
  name: 'electron_select_option',
  description:
    'Select a dropdown option by value or visible text. Identify the <select> via selector or adjacent label text.',
  schema,
  operationType: 'command',
  async execute(args, target) {
    const javascriptCode = generateSelectOptionCommand(
      args.selector ?? '',
      args.value,
      args.text ?? '',
    );
    return executeInElectron(javascriptCode, target);
  },
});
