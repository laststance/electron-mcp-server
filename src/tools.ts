import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  TakeScreenshotSchema,
  ReadElectronLogsSchema,
  GetElectronWindowInfoSchema,
  ListElectronWindowsSchema,
  ToolInput,
} from './schemas';
import { allCommands } from './commands';

/**
 * Names of the static (non-`electron_*`) MCP tools.
 *
 * v2.0.0 removed `SEND_COMMAND_TO_ELECTRON` and replaced it with one tool per
 * UI command (registered dynamically from `allCommands`). Static tools handle
 * cross-cutting concerns that aren't tied to a single CDP target.
 */
export enum ToolName {
  TAKE_SCREENSHOT = 'take_screenshot',
  READ_ELECTRON_LOGS = 'read_electron_logs',
  GET_ELECTRON_WINDOW_INFO = 'get_electron_window_info',
  LIST_ELECTRON_WINDOWS = 'list_electron_windows',
}

/**
 * Static MCP tools (cross-cutting; not part of the per-command registry).
 * Keep these listed before the dynamic tools so MCP `tools/list` returns
 * window-discovery and screenshot first — that's what callers use to bootstrap.
 */
const staticTools = [
  {
    name: ToolName.GET_ELECTRON_WINDOW_INFO,
    description:
      'Get information about running Electron applications and their windows. Automatically detects any Electron app with remote debugging enabled (port 9222).',
    inputSchema: zodToJsonSchema(GetElectronWindowInfoSchema) as ToolInput,
  },
  {
    name: ToolName.LIST_ELECTRON_WINDOWS,
    description:
      "List all available Electron window targets across all detected applications. Returns window IDs, titles, URLs, and ports. Use the returned IDs with any electron_* tool's targetId parameter to target specific windows.",
    inputSchema: zodToJsonSchema(ListElectronWindowsSchema) as ToolInput,
  },
  {
    name: ToolName.TAKE_SCREENSHOT,
    description:
      'Take a screenshot of any running Electron application window. Returns base64 image data for AI analysis. No files created unless outputPath is specified.',
    inputSchema: zodToJsonSchema(TakeScreenshotSchema) as ToolInput,
  },
  {
    name: ToolName.READ_ELECTRON_LOGS,
    description:
      'Read console logs and output from running Electron applications. Useful for debugging and monitoring app behavior.',
    inputSchema: zodToJsonSchema(ReadElectronLogsSchema) as ToolInput,
  },
];

/**
 * Tools registered dynamically from the command registry. One MCP tool per
 * `electron_*` command — see `src/commands/index.ts` for the source list.
 */
const dynamicTools = allCommands.map((cmd) => ({
  name: cmd.name,
  description: cmd.description,
  inputSchema: zodToJsonSchema(cmd.schema) as ToolInput,
}));

/** Full tool list shipped to MCP clients via `tools/list`. */
export const tools = [...staticTools, ...dynamicTools];
