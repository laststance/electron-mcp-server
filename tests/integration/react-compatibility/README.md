# React Compatibility Tests

This directory contains test files for validating React compatibility with the Electron MCP Server.

## Files

### `react-test-app.html`
A comprehensive React test application that demonstrates:
- Click command compatibility with `preventDefault()` behavior
- Form input detection and filling capabilities  
- Various React event handling patterns
- Multiple input types (text, email, password, number, textarea)

### `test-react-electron.cjs`
Electron wrapper application that:
- Loads the React test app in an Electron window
- Enables remote debugging on port 9222 for MCP server connection
- Provides a controlled test environment

## Usage

### Running the Test App
```bash
# From the project root
cd tests/integration/react-compatibility
electron test-react-electron.cjs
```

### Testing with MCP Server
Once the Electron app is running, you can test MCP commands:

```bash
# Test click commands
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "send_command_to_electron", "arguments": {"command": "click_by_text", "args": {"text": "React Button"}}}}' | node ../../../dist/index.js

# Test form input filling
echo '{"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "send_command_to_electron", "arguments": {"command": "fill_input", "args": {"text": "username", "value": "testuser"}}}}' | node ../../../dist/index.js

# Get page structure
echo '{"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "send_command_to_electron", "arguments": {"command": "get_page_structure", "args": {}}}}' | node ../../../dist/index.js
```

## Test Scenarios

### Issue 1: Click Commands with preventDefault
- **React Button (preventDefault)**: Tests click commands on React components that call `e.preventDefault()`
- **Normal Button**: Tests click commands without preventDefault  
- **Stop Propagation Button**: Tests click commands with `e.stopPropagation()`

### Issue 3: Form Input Detection
- **Username Field**: Text input with label and placeholder
- **Email Field**: Email input type validation
- **Password Field**: Password input type
- **Age Field**: Number input type
- **Comments Field**: Textarea element

All form inputs test the scoring algorithm in `electron-input-commands.ts` for React-rendered elements.

## Expected Results

✅ All click commands should work (preventDefault fix applied)  
✅ All form inputs should be detected and fillable  
✅ Page structure should show all React-rendered elements  
✅ No "Click events were cancelled by the page" errors  
✅ No "No suitable input found" errors
