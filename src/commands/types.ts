import type { z } from 'zod';
import type { DevToolsTarget } from '../utils/electron-connection';

/**
 * A self-contained Electron MCP command module (registry-side, type-erased).
 *
 * Each `electron_*` MCP tool is one of these. Phase 1 (v2.0.0) replaced the
 * monolithic `send_command_to_electron` tool — which dispatched 18 subcommands
 * via a switch/case — with one `CommandModule` per tool. The registry in
 * `commands/index.ts` aggregates them, and `tools.ts` / `handlers.ts` look up
 * the right module by name instead of hard-coding cases.
 *
 * The interface intentionally **drops the schema generic** so that command
 * modules with different schemas can live in a single `Array<CommandModule>`.
 * Per-command type safety is recovered through the {@link defineCommand}
 * factory, which infers the schema and types `execute(args, target)`
 * accordingly at construction time.
 *
 * @see defineCommand — the type-safe constructor every command file should use.
 */
export interface CommandModule {
  /** MCP tool name. Must start with `electron_`. */
  readonly name: string;
  /** Human-readable description shown in MCP `tools/list` responses. */
  readonly description: string;
  /** Zod schema validating the user-supplied args object. */
  readonly schema: z.ZodTypeAny;
  /**
   * Coarse classification used by SecurityManager to decide sandbox routing
   * and audit-log labeling.
   * - `query`: read-only DOM/state inspection (low risk, sandbox-bypass).
   * - `command`: UI mutation (click, fill, hover) — generated JS only.
   * - `eval`: arbitrary user JavaScript (highest risk; validateEvalContent runs).
   */
  readonly operationType: 'command' | 'query' | 'eval';
  /**
   * Execute the command against an already-resolved CDP target.
   * Args are typed as `any` here so that modules with different schemas can
   * share the registry; the handler always parses through `schema` first, so
   * by the time `execute` is called the args have been validated.
   * @returns User-facing result string (often prefixed with ✅, ⚠️, or ❌).
   */
  execute: (args: any, target: DevToolsTarget) => Promise<string>;
}

/**
 * Type-safe constructor for a CommandModule.
 *
 * Within a command file, this preserves the narrow `z.infer<typeof schema>`
 * type for the `execute` callback's `args` parameter. The returned value is
 * widened to the registry-side {@link CommandModule} so it can be aggregated
 * with sibling commands.
 *
 * @example
 * const schema = z.object({ selector: z.string() });
 *
 * export const clickBySelector = defineCommand({
 *   name: 'electron_click_by_selector',
 *   description: 'Click the first element matching the CSS selector.',
 *   schema,
 *   operationType: 'command',
 *   async execute(args, target) {
 *     // args is { selector: string } here — full IntelliSense.
 *     return runClick(args.selector, target);
 *   },
 * });
 */
export function defineCommand<TSchema extends z.ZodTypeAny>(definition: {
  readonly name: string;
  readonly description: string;
  readonly schema: TSchema;
  readonly operationType: 'command' | 'query' | 'eval';
  execute: (args: z.infer<TSchema>, target: DevToolsTarget) => Promise<string>;
}): CommandModule {
  return definition;
}
