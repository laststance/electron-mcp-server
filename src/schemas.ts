import { z } from 'zod';

// Command arguments schema for better type safety and documentation
export const CommandArgsSchema = z
  .object({
    selector: z
      .string()
      .optional()
      .describe(
        'CSS selector for targeting elements (required for click_by_selector, click_button)',
      ),
    text: z
      .string()
      .optional()
      .describe(
        'Text content for searching or keyboard input (required for click_by_text, send_keyboard_shortcut)',
      ),
    value: z
      .string()
      .optional()
      .describe('Value to input into form fields (required for fill_input)'),
    placeholder: z
      .string()
      .optional()
      .describe(
        'Placeholder text to identify input fields (alternative to selector for fill_input)',
      ),
    message: z.string().optional().describe('Message or content for specific commands'),
    code: z.string().optional().describe('JavaScript code to execute (for eval command)'),
  })
  .describe('Command-specific arguments. Structure depends on the command being executed.');

// Schema definitions for tool inputs
export const SendCommandToElectronSchema = z.object({
  command: z.string().describe('Command to send to the Electron process'),
  args: CommandArgsSchema.optional().describe(
    'Arguments for the command - must be an object with appropriate properties based on the command type',
  ),
});

export const TakeScreenshotSchema = z.object({
  outputPath: z
    .string()
    .optional()
    .describe('Path to save the screenshot (optional, defaults to temp directory)'),
  windowTitle: z.string().optional().describe('Specific window title to screenshot (optional)'),
});

export const ReadElectronLogsSchema = z.object({
  logType: z
    .enum(['console', 'main', 'renderer', 'all'])
    .optional()
    .describe('Type of logs to read'),
  lines: z.number().optional().describe('Number of recent lines to read (default: 100)'),
  follow: z.boolean().optional().describe('Whether to follow/tail the logs'),
});

export const GetElectronWindowInfoSchema = z.object({
  includeChildren: z.boolean().optional().describe('Include child windows information'),
});

// Type helper for tool input schema
export type ToolInput = {
  type: 'object';
  properties: Record<string, any>;
  required?: string[];
};
