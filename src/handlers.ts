import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types';
import { z } from 'zod';
import { ToolName } from './tools';
import {
  TakeScreenshotSchema,
  ReadElectronLogsSchema,
  GetElectronWindowInfoSchema,
  ListElectronWindowsSchema,
} from './schemas';
import { commandsByName, extractWindowTarget } from './commands';
import { getElectronWindowInfo, listElectronWindows } from './utils/electron-discovery';
import { findElectronTarget } from './utils/electron-connection';
import { readElectronLogs } from './utils/electron-logs';
import { takeScreenshot } from './screenshot';
import { logger } from './utils/logger';
import { securityManager } from './security/manager';

/**
 * Tool name → handler dispatcher.
 *
 * v2.0.0 architecture:
 * - Static tools (window info / screenshot / list windows / read logs) keep
 *   their dedicated `case` blocks because they don't fit the per-command
 *   registry pattern (cross-cutting; no CDP target resolution).
 * - Every `electron_*` tool is dispatched generically through the
 *   `commandsByName` registry. This replaces the v1 `send_command_to_electron`
 *   switch/case dispatch and removes the `command/args` indirection.
 */
export async function handleToolCall(request: z.infer<typeof CallToolRequestSchema>) {
  const { name, arguments: args } = request.params;

  const sourceIP = (request as any).meta?.sourceIP;
  const userAgent = (request as any).meta?.userAgent;

  try {
    switch (name) {
      case ToolName.GET_ELECTRON_WINDOW_INFO: {
        const { includeChildren } = GetElectronWindowInfoSchema.parse(args);

        const securityResult = await securityManager.executeSecurely({
          command: 'get_window_info',
          args,
          sourceIP,
          userAgent,
          operationType: 'window_info',
        });

        if (securityResult.blocked) {
          return {
            content: [{ type: 'text', text: `Operation blocked: ${securityResult.error}` }],
            isError: true,
          };
        }

        const result = await getElectronWindowInfo(includeChildren);
        return {
          content: [
            {
              type: 'text',
              text: `Window Information:\n\n${JSON.stringify(result, null, 2)}`,
            },
          ],
          isError: false,
        };
      }

      case ToolName.TAKE_SCREENSHOT: {
        const securityResult = await securityManager.executeSecurely({
          command: 'take_screenshot',
          args,
          sourceIP,
          userAgent,
          operationType: 'screenshot',
        });

        if (securityResult.blocked) {
          return {
            content: [{ type: 'text', text: `Screenshot blocked: ${securityResult.error}` }],
            isError: true,
          };
        }
        const { outputPath, windowTitle } = TakeScreenshotSchema.parse(args);
        const result = await takeScreenshot(outputPath, windowTitle);

        const content: any[] = [];
        if (result.filePath) {
          content.push({ type: 'text', text: `Screenshot saved to: ${result.filePath}` });
        } else {
          content.push({ type: 'text', text: 'Screenshot captured in memory (no file saved)' });
        }
        content.push({ type: 'image', data: result.base64!, mimeType: 'image/png' });

        return { content, isError: false };
      }

      case ToolName.READ_ELECTRON_LOGS: {
        const { logType, lines, follow } = ReadElectronLogsSchema.parse(args);
        const logs = await readElectronLogs(logType, lines);

        const prefix = follow
          ? `Following logs (${logType}). This is a snapshot of recent logs:`
          : `Electron logs (${logType}):`;

        return {
          content: [{ type: 'text', text: `${prefix}\n\n${logs}` }],
          isError: false,
        };
      }

      case ToolName.LIST_ELECTRON_WINDOWS: {
        const { includeDevTools } = ListElectronWindowsSchema.parse(args);

        const securityResult = await securityManager.executeSecurely({
          command: 'list_windows',
          args,
          sourceIP,
          userAgent,
          operationType: 'window_info',
        });

        if (securityResult.blocked) {
          return {
            content: [{ type: 'text', text: `Operation blocked: ${securityResult.error}` }],
            isError: true,
          };
        }

        const windows = await listElectronWindows(includeDevTools);

        if (windows.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No Electron windows found. Ensure your app is running with --remote-debugging-port=9222',
              },
            ],
            isError: false,
          };
        }

        const formatted = windows
          .map(
            (w) => `- [${w.id}] "${w.title}" (port: ${w.port}, type: ${w.type})\n  URL: ${w.url}`,
          )
          .join('\n');

        return {
          content: [
            {
              type: 'text',
              text: `Available Electron windows (${windows.length}):\n\n${formatted}`,
            },
          ],
          isError: false,
        };
      }

      default: {
        // Generic dispatch for every `electron_*` command in the registry.
        const command = commandsByName.get(name);
        if (!command) {
          return {
            content: [{ type: 'text', text: `Unknown tool: ${name}` }],
            isError: true,
          };
        }

        // Validate args against the command's own schema.
        const parsed = command.schema.parse(args ?? {});

        // Security pipeline. For eval we pass the actual code as the validated
        // content (and as `args`) so `validateEvalContent` runs against the
        // user's JS instead of the tool name. For everything else, the tool
        // name is what gets validated — generated JS comes later inside
        // `command.execute` and is not user-controlled.
        const isEvalCommand = command.operationType === 'eval';
        const securityCommand = isEvalCommand ? String(parsed.code ?? '') : command.name;
        const securityArgs = isEvalCommand ? String(parsed.code ?? '') : parsed;

        const securityResult = await securityManager.executeSecurely({
          command: securityCommand,
          args: securityArgs,
          sourceIP,
          userAgent,
          operationType: command.operationType,
        });

        if (securityResult.blocked) {
          return {
            content: [
              {
                type: 'text',
                text: `Command blocked: ${securityResult.error}\nRisk Level: ${securityResult.riskLevel}`,
              },
            ],
            isError: true,
          };
        }

        if (!securityResult.success) {
          return {
            content: [{ type: 'text', text: `Command failed: ${securityResult.error}` }],
            isError: true,
          };
        }

        // Resolve the CDP target the command should run against.
        const targetOptions = extractWindowTarget(parsed);
        const target = await findElectronTarget(targetOptions);

        const result = await command.execute(parsed, target);
        return {
          content: [{ type: 'text', text: result }],
          isError: false,
        };
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    logger.error(`Tool execution failed: ${name}`, {
      error: errorMessage,
      stack: errorStack,
      args,
    });

    return {
      content: [{ type: 'text', text: `Error executing ${name}: ${errorMessage}` }],
      isError: true,
    };
  }
}
