import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types';
import { z } from 'zod';
import { ToolName } from './tools';
import {
  SendCommandToElectronSchema,
  TakeScreenshotSchema,
  ReadElectronLogsSchema,
  GetElectronWindowInfoSchema,
  ListElectronWindowsSchema,
} from './schemas';
import { sendCommandToElectron } from './utils/electron-enhanced-commands';
import { getElectronWindowInfo, listElectronWindows } from './utils/electron-discovery';
import { WindowTargetOptions } from './utils/electron-connection';
import { readElectronLogs } from './utils/electron-logs';
import { takeScreenshot } from './screenshot';
import { logger } from './utils/logger';
import { securityManager } from './security/manager';

export async function handleToolCall(request: z.infer<typeof CallToolRequestSchema>) {
  const { name, arguments: args } = request.params;

  // Extract request metadata for security logging
  const sourceIP = (request as any).meta?.sourceIP;
  const userAgent = (request as any).meta?.userAgent;

  try {
    switch (name) {
      case ToolName.GET_ELECTRON_WINDOW_INFO: {
        // This is a low-risk read operation - basic validation only
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
            content: [
              {
                type: 'text',
                text: `Operation blocked: ${securityResult.error}`,
              },
            ],
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
        // Security check for screenshot operation
        const securityResult = await securityManager.executeSecurely({
          command: 'take_screenshot',
          args,
          sourceIP,
          userAgent,
          operationType: 'screenshot',
        });

        if (securityResult.blocked) {
          return {
            content: [
              {
                type: 'text',
                text: `Screenshot blocked: ${securityResult.error}`,
              },
            ],
            isError: true,
          };
        }
        const { outputPath, windowTitle } = TakeScreenshotSchema.parse(args);
        const result = await takeScreenshot(outputPath, windowTitle);

        // Return the screenshot as base64 data for AI to evaluate
        const content: any[] = [];

        if (result.filePath) {
          content.push({
            type: 'text',
            text: `Screenshot saved to: ${result.filePath}`,
          });
        } else {
          content.push({
            type: 'text',
            text: 'Screenshot captured in memory (no file saved)',
          });
        }

        // Add the image data for AI evaluation
        content.push({
          type: 'image',
          data: result.base64!,
          mimeType: 'image/png',
        });

        return { content, isError: false };
      }

      case ToolName.SEND_COMMAND_TO_ELECTRON: {
        const {
          command,
          args: commandArgs,
          targetId,
          windowTitle,
        } = SendCommandToElectronSchema.parse(args);

        // Execute command through security manager
        const securityResult = await securityManager.executeSecurely({
          command,
          args: commandArgs,
          sourceIP,
          userAgent,
          operationType: 'command',
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
            content: [
              {
                type: 'text',
                text: `Command failed: ${securityResult.error}`,
              },
            ],
            isError: true,
          };
        }

        // Build window target options if specified
        const windowOptions: WindowTargetOptions | undefined =
          targetId || windowTitle ? { targetId, windowTitle } : undefined;

        // Execute the actual command if security checks pass
        const result = await sendCommandToElectron(command, commandArgs, windowOptions);
        return {
          content: [{ type: 'text', text: result }],
          isError: false,
        };
      }

      case ToolName.READ_ELECTRON_LOGS: {
        const { logType, lines, follow } = ReadElectronLogsSchema.parse(args);
        const logs = await readElectronLogs(logType, lines);

        if (follow) {
          return {
            content: [
              {
                type: 'text',
                text: `Following logs (${logType}). This is a snapshot of recent logs:\n\n${logs}`,
              },
            ],
            isError: false,
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: `Electron logs (${logType}):\n\n${logs}`,
            },
          ],
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
            content: [
              {
                type: 'text',
                text: `Operation blocked: ${securityResult.error}`,
              },
            ],
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

      default:
        return {
          content: [
            {
              type: 'text',
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
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
      content: [
        {
          type: 'text',
          text: `Error executing ${name}: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}
