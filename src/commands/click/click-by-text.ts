import { z } from 'zod';
import { executeInElectron } from '../../utils/electron-connection';
import { generateClickByTextCommand } from '../../utils/electron-commands';
import { windowTargetFields } from '../shared/window-target';
import { defineCommand } from '../types';

const schema = z.object({
  ...windowTargetFields,
  text: z
    .string()
    .min(1)
    .describe(
      'Visible text, aria-label, or title to match. Best-effort scoring; pass a longer/more unique substring when matches are ambiguous.',
    ),
});

/**
 * Click by visible text / aria-label / title.
 * Element scoring lives in `utils/electron-commands.ts:generateClickByTextCommand`.
 *
 * Caveat: short strings can false-positive on multiple candidates — see
 * GitHub issue #3. Phase 4 (T25-T28) will offer CDP-level alternatives.
 *
 * ⚠️ Rate-limit: same-element clicks fired within
 * `CLICK_BY_TEXT_RATE_LIMIT_MS` of the previous one return an error string
 * containing `"Element click prevented - too soon after previous click"`
 * (the underlying `throw` is caught and surfaced as a returned failure
 * message). The window is deliberately longer than the selector variant
 * because text scoring + `scrollIntoView({ behavior: 'smooth' })` can
 * legitimately take ~1s. Serialize click flows (await each call) to avoid this.
 */
export const clickByText = defineCommand({
  name: 'electron_click_by_text',
  description:
    'Click an element by visible text, aria-label, or title. Best for buttons/links. Returns confidence score on match. Note: same-element clicks within ~2s are rate-limited and return an error containing "Element click prevented - too soon after previous click" — serialize calls (await each) to avoid this.',
  schema,
  operationType: 'command',
  async execute(args, target) {
    return executeInElectron(generateClickByTextCommand(args.text), target);
  },
});
