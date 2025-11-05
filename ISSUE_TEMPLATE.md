# Bug Report Template

When reporting bugs with the Electron MCP Server, please include the following technical details to help developers understand and reproduce the issue.

## Basic Information

- **MCP Server Version**: `electron-mcp-server@x.x.x`
- **Node.js Version**: `node --version`
- **Electron Version**: `electron --version`
- **Operating System**: Windows/macOS/Linux
- **Security Level**: STRICT/BALANCED/PERMISSIVE/DEVELOPMENT

## Bug Description

### Expected Behavior
What should happen when the command is executed.

### Actual Behavior
What actually happens, including any error messages.

## Reproduction Steps

### 1. MCP Command Structure

**Tool Name**: `tool_name`
**Method**: `tools/call`
**Arguments Structure**:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "tool_name",
    "arguments": {
      "command": "command_name",
      "args": {
        "parameter": "value"
      }
    }
  }
}
```

### 2. Full Command Example

```bash
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "send_command_to_electron", "arguments": {"command": "click_by_text", "args": {"text": "Button Text"}}}}' | node dist/index.js
```

### 3. Error Output

```
[MCP] ERROR: Error message here
{"result":{"content":[{"type":"text","text":"❌ Error: Detailed error message"}],"isError":true},"jsonrpc":"2.0","id":1}
```

### 4. Expected Output

```
[MCP] INFO: Success message here
{"result":{"content":[{"type":"text","text":"✅ Result: Success message"}],"isError":false},"jsonrpc":"2.0","id":1}
```

## Technical Context

### Target Application
- **Application Type**: React/Vue/Angular/Vanilla JS
- **Framework Version**: React 18, Vue 3, etc.
- **Electron Remote Debugging**: Port 9222 enabled
- **DevTools Available**: Yes/No

### Environment Setup

```bash
# Commands to reproduce the environment
npm install
npm run build
npm run start
```

### Application State
- **Page URL**: `file:///path/to/app.html` or `http://localhost:3000`
- **DOM Elements**: Provide `get_page_structure` output if relevant
- **Console Errors**: Any JavaScript errors in the target application

## Additional Information

### Related Files
- Source code files involved
- Configuration files
- Log files

### Debugging Attempts
What you've already tried to fix the issue.

### Screenshots
Include screenshots of the application state, if helpful.

---

## Example Bug Reports

### Example 1: Click Command Failure

**Bug**: Click commands fail on React components with preventDefault

**MCP Command**:
```bash
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "send_command_to_electron", "arguments": {"command": "click_by_text", "args": {"text": "Submit"}}}}' | node dist/index.js
```

**Error Output**:
```
[MCP] INFO: Tool call: send_command_to_electron
{"result":{"content":[{"type":"text","text":"❌ Error: Click events were cancelled by the page"}],"isError":true},"jsonrpc":"2.0","id":1}
```

**Expected Output**:
```
{"result":{"content":[{"type":"text","text":"✅ Result: Successfully clicked element: Submit"}],"isError":false},"jsonrpc":"2.0","id":1}
```

**Technical Details**:
- **Target Element**: `<button onClick={e => e.preventDefault()}>Submit</button>`
- **Issue Location**: `src/utils/electron-commands.ts:515`
- **Root Cause**: preventDefault() treated as failure condition

### Example 2: Form Input Detection Failure

**Bug**: fill_input returns "No suitable input found" for visible React inputs

**MCP Command**:
```bash
echo '{"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "send_command_to_electron", "arguments": {"command": "fill_input", "args": {"text": "username", "value": "testuser"}}}}' | node dist/index.js
```

**Error Output**:
```
{"result":{"content":[{"type":"text","text":"❌ Error: No suitable input found for: \"username\". Available inputs: email, password, submit"}],"isError":true},"jsonrpc":"2.0","id":2}
```

**Page Structure Output**:
```bash
echo '{"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "send_command_to_electron", "arguments": {"command": "get_page_structure", "args": {}}}}' | node dist/index.js
```

```json
{
  "inputs": [
    {
      "type": "text",
      "placeholder": "Enter username",
      "label": "Username",
      "id": "username",
      "name": "username",
      "visible": true
    }
  ]
}
```

**Technical Details**:
- **Target Element**: `<input id="username" name="username" placeholder="Enter username" />`
- **Issue Location**: `src/utils/electron-input-commands.ts` scoring algorithm
- **Root Cause**: Scoring algorithm fails to match React-rendered inputs
