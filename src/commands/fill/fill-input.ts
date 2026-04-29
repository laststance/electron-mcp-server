import { z } from 'zod';
import { executeInElectron } from '../../utils/electron-connection';
import { generateFillInputCommand } from '../../utils/electron-input-commands';
import { windowTargetFields } from '../shared/window-target';
import { defineCommand } from '../types';

const schema = z
  .object({
    ...windowTargetFields,
    value: z.string().min(1).describe('Text to fill into the input. Required.'),
    selector: z
      .string()
      .optional()
      .describe('CSS selector for the input. Pass either selector or placeholder.'),
    placeholder: z
      .string()
      .optional()
      .describe(
        'Placeholder text, label text, name, or aria-label to identify the input via fuzzy match.',
      ),
  })
  .refine((args) => Boolean(args.selector || args.placeholder), {
    message: 'Either `selector` or `placeholder` must be provided to identify the input.',
  });

/**
 * Fill an input element with a value, with React-aware event dispatch.
 *
 * Strategy (handled in `generateFillInputCommand`):
 * 1. If selector is provided, try `document.querySelector` first.
 * 2. Otherwise, score visible inputs by placeholder/label/name/aria-label
 *    similarity to the `placeholder` arg and pick the best match.
 * 3. Use the React-internal `nativeInputValueSetter` so React's controlled
 *    components actually pick up the change.
 * 4. Dispatch focus → keydown → input → change → blur in sequence.
 */
export const fillInput = defineCommand({
  name: 'electron_fill_input',
  description:
    'Fill an input or textarea with a value. React-aware (uses native setter so controlled components update). Identify by selector OR placeholder/label.',
  schema,
  operationType: 'command',
  async execute(args, target) {
    const javascriptCode = generateFillInputCommand(
      args.selector ?? '',
      args.value,
      args.placeholder ?? '',
    );
    return executeInElectron(javascriptCode, target);
  },
});
