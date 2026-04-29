import { z } from 'zod';
import type { WindowTargetOptions } from '../../utils/electron-connection';

/**
 * Reusable schema fields for selecting which Electron window to target.
 * Most commands extend this with their own command-specific fields via
 * spread: `z.object({ ...windowTargetFields, selector: z.string() })`.
 *
 * Why a fields object rather than a Zod schema:
 * - Zod composition via `.extend()` works but loses field-level descriptions
 *   when generated to JSON schema. Spreading raw fields keeps descriptions intact.
 */
export const windowTargetFields = {
  targetId: z
    .string()
    .optional()
    .describe(
      'CDP target ID for exact-match window targeting. Use list_electron_windows to discover IDs.',
    ),
  windowTitle: z
    .string()
    .optional()
    .describe(
      'Window title for case-insensitive partial-match targeting. Ignored if targetId is set.',
    ),
};

/** Schema for tools that only need window targeting (no other args). */
export const WindowTargetSchema = z.object(windowTargetFields);
export type WindowTargetArgs = z.infer<typeof WindowTargetSchema>;

/**
 * Pull the targeting subset out of any args object so the handler can resolve
 * the CDP target before calling the command's `execute`.
 *
 * Precedence: `targetId` wins. If a non-empty `targetId` is supplied we never
 * forward `windowTitle` — passing both contradicts the documented behavior
 * (and `findElectronTarget` would silently use only one). Empty strings are
 * treated as absent.
 *
 * @example
 * const target = await findElectronTarget(extractWindowTarget(args));
 */
export function extractWindowTarget(args: {
  targetId?: string;
  windowTitle?: string;
}): WindowTargetOptions | undefined {
  const targetId = args.targetId?.trim();
  if (targetId) {
    return { targetId };
  }
  const windowTitle = args.windowTitle?.trim();
  if (windowTitle) {
    return { windowTitle };
  }
  return undefined;
}
