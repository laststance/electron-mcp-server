import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  SendCommandToElectronSchema,
  TakeScreenshotSchema,
  ReadElectronLogsSchema,
  GetElectronWindowInfoSchema,
  ListElectronWindowsSchema,
  ToolInput,
} from './schemas';

// Tool name enumeration
export enum ToolName {
  SEND_COMMAND_TO_ELECTRON = 'send_command_to_electron',
  TAKE_SCREENSHOT = 'take_screenshot',
  READ_ELECTRON_LOGS = 'read_electron_logs',
  GET_ELECTRON_WINDOW_INFO = 'get_electron_window_info',
  LIST_ELECTRON_WINDOWS = 'list_electron_windows',
}

// Define tools available to the MCP server
export const tools = [
  {
    name: ToolName.GET_ELECTRON_WINDOW_INFO,
    description:
      'Get information about running Electron applications and their windows. Automatically detects any Electron app with remote debugging enabled (port 9222).',
    inputSchema: zodToJsonSchema(GetElectronWindowInfoSchema) as ToolInput,
  },
  {
    name: ToolName.TAKE_SCREENSHOT,
    description:
      'Take a screenshot of any running Electron application window. Returns base64 image data for AI analysis. No files created unless outputPath is specified.',
    inputSchema: zodToJsonSchema(TakeScreenshotSchema) as ToolInput,
  },
  {
    name: ToolName.SEND_COMMAND_TO_ELECTRON,
    description: `Send JavaScript commands to any running Electron application via Chrome DevTools Protocol. 

Enhanced UI interaction commands:
- 'find_elements': Analyze all interactive elements (buttons, inputs, selects) with their properties
- 'click_by_text': Click elements by their visible text, aria-label, or title
- 'click_by_selector': Securely click elements by CSS selector
- 'fill_input': Fill input fields by selector, placeholder text, or associated label
- 'select_option': Select dropdown options by value or text
- 'send_keyboard_shortcut': Send keyboard shortcuts like 'Ctrl+N', 'Meta+N', 'Enter', 'Escape'
- 'navigate_to_hash': Safely navigate to hash routes (e.g., '#create', '#settings')
- 'get_page_structure': Get organized overview of page elements (buttons, inputs, selects, links)
- 'debug_elements': Get debugging info about buttons and form elements on the page
- 'verify_form_state': Check current form state and validation status
- 'get_title', 'get_url', 'get_body_text': Basic page information
- 'eval': Execute custom JavaScript code with enhanced error reporting

IMPORTANT: Arguments must be passed as an object with the correct properties:

Examples:
- click_by_selector: {"selector": "button.submit-btn"}
- click_by_text: {"text": "Submit"}
- fill_input: {"placeholder": "Enter name", "value": "John Doe"}
- fill_input: {"selector": "#email", "value": "user@example.com"}
- send_keyboard_shortcut: {"text": "Enter"}
- eval: {"code": "document.title"}

Use 'get_page_structure' or 'debug_elements' first to understand available elements, then use specific interaction commands.

Multi-window support:
- targetId: Specify a CDP target ID to send commands to a specific window (exact match)
- windowTitle: Specify a window title to target (case-insensitive partial match)
- If neither is specified, commands are sent to the first available main window (backward compatible)
- Use 'list_electron_windows' to see available windows and their IDs`,
    inputSchema: zodToJsonSchema(SendCommandToElectronSchema) as ToolInput,
  },
  {
    name: ToolName.LIST_ELECTRON_WINDOWS,
    description:
      "List all available Electron window targets across all detected applications. Returns window IDs, titles, URLs, and ports. Use the returned IDs with send_command_to_electron's targetId parameter to target specific windows.",
    inputSchema: zodToJsonSchema(ListElectronWindowsSchema) as ToolInput,
  },
  {
    name: ToolName.READ_ELECTRON_LOGS,
    description:
      'Read console logs and output from running Electron applications. Useful for debugging and monitoring app behavior.',
    inputSchema: zodToJsonSchema(ReadElectronLogsSchema) as ToolInput,
  },
];
