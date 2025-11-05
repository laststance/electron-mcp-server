# Electron MCP Demo App

A demonstration Electron application designed to test all features of the [Electron MCP Server](https://github.com/halilural/electron-mcp-server). This app provides an interactive interface with various UI elements to validate MCP automation capabilities.

## 🎯 Purpose

This demo app showcases:

- **Button Interactions**: Test `click_by_text` and `click_by_selector` commands
- **Form Inputs**: Test `fill_input` with various input types
- **Dropdown Selection**: Test `select_option` with select elements
- **Radio & Checkboxes**: Test form element selection
- **State Management**: Test multiple interactions with counter functionality
- **Event Logging**: Monitor all UI interactions in real-time

## 📦 Setup

### 1. Install Dependencies

```bash
cd examples/demo-app
npm install
```

### 2. Start the Demo App

**Development Mode (with DevTools Protocol):**

```bash
npm run dev
```

This will:

- Launch the Electron app
- Enable Chrome DevTools Protocol on port `9222`
- Open DevTools automatically
- Display the demo interface

**Production Mode:**

```bash
npm start
```

## 🚀 Using with MCP Server

### Prerequisites

1. **Demo App Running**: Start this demo app with `npm run dev`
2. **MCP Server Running**: Have the Electron MCP Server installed and configured
3. **DevTools Port**: Verify port 9222 is available

### Verify Connection

Check that the DevTools Protocol is accessible:

```bash
curl http://localhost:9222/json
```

You should see JSON output with target information.

### MCP Server Configuration

Configure your MCP client (VS Code or Claude Desktop) to use the Electron MCP Server:

```json
{
  "mcpServers": {
    "electron": {
      "command": "npx",
      "args": ["-y", "electron-mcp-server"],
      "env": {
        "SECURITY_LEVEL": "balanced"
      }
    }
  }
}
```

## 🎮 Testing MCP Commands

### 1. Get Page Structure

First, understand what elements are available:

```javascript
{
  "command": "get_page_structure"
}
```

### 2. Click Buttons

**By Text (Recommended):**

```javascript
{
  "command": "click_by_text",
  "args": {
    "text": "Create New Item"
  }
}
```

**By Selector:**

```javascript
{
  "command": "click_by_selector",
  "args": {
    "selector": "#create-btn"
  }
}
```

### 3. Fill Form Inputs

**By Placeholder:**

```javascript
{
  "command": "fill_input",
  "args": {
    "placeholder": "Enter your name",
    "value": "John Doe"
  }
}
```

**By Selector:**

```javascript
{
  "command": "fill_input",
  "args": {
    "selector": "#email",
    "value": "john@example.com"
  }
}
```

### 4. Select Dropdown Options

```javascript
{
  "command": "click_by_selector",
  "args": {
    "selector": "#country"
  }
}
// Then select an option
{
  "command": "eval",
  "args": {
    "code": "document.getElementById('country').value = 'us'; document.getElementById('country').dispatchEvent(new Event('change'));"
  }
}
```

### 5. Test Counter

```javascript
// Increment counter
{
  "command": "click_by_text",
  "args": {
    "text": "+ Increment"
  }
}

// Get current counter value
{
  "command": "eval",
  "args": {
    "code": "document.getElementById('counter-value').textContent"
  }
}
```

### 6. Take Screenshots

```javascript
take_screenshot({
  outputPath: "/path/to/screenshot.png"
})
```

### 7. Read Event Logs

Monitor the event log section to see all interactions logged in real-time.

## 📋 App Sections

### Basic Actions

Three buttons to test simple click operations:

- **Create New Item** - Primary action button
- **Submit Form** - Success action button
- **Cancel Operation** - Secondary action button

### Form Inputs

Multiple input types for comprehensive testing:

- **Text Input** - Name field
- **Email Input** - Email field with validation
- **Number Input** - Age field
- **Textarea** - Description field

### Selection Inputs

Various selection mechanisms:

- **Dropdown** - Country selection
- **Radio Buttons** - Gender selection
- **Checkbox** - Terms acceptance

### Counter

State management demonstration:

- Increment/Decrement buttons
- Counter display
- Reset functionality

### Event Log

Real-time logging of all UI interactions with:

- Timestamps
- Action descriptions
- Event types (success, info, warning, error)

## 🛠️ Development

### File Structure

```
demo-app/
├── package.json      # Dependencies and scripts
├── main.js           # Electron main process
├── preload.js        # Preload script for security
├── index.html        # UI markup
├── renderer.js       # UI logic and event handlers
├── styles.css        # Styling
└── README.md         # This file
```

### Key Features

- **DevTools Protocol**: Enabled automatically in dev mode
- **Event Logging**: All interactions are logged
- **Data Attributes**: Elements have `data-testid` for easy targeting
- **Semantic HTML**: Proper use of labels and ARIA attributes
- **Responsive Design**: Works on different screen sizes

## 🐛 Troubleshooting

### Port 9222 Already in Use

If you see an error about port 9222:

```bash
# Find the process using the port
lsof -i :9222

# Kill the process
kill -9 <PID>
```

### DevTools Not Opening

Ensure you're running in dev mode:

```bash
npm run dev
```

### MCP Server Can't Connect

1. Verify the app is running
2. Check port 9222 is accessible: `curl http://localhost:9222/json`
3. Restart both the demo app and MCP server

### Elements Not Found

Use `get_page_structure` first to see available elements and their selectors.

## 📝 Example Workflow

Complete workflow to test all features:

```javascript
// 1. Get page structure
{ "command": "get_page_structure" }

// 2. Click create button
{ "command": "click_by_text", "args": { "text": "Create New Item" } }

// 3. Fill name
{ "command": "fill_input", "args": { "placeholder": "Enter your name", "value": "Test User" } }

// 4. Fill email
{ "command": "fill_input", "args": { "placeholder": "Enter your email", "value": "test@example.com" } }

// 5. Increment counter
{ "command": "click_by_text", "args": { "text": "+ Increment" } }

// 6. Take screenshot
take_screenshot()

// 7. Check event log
{ "command": "eval", "args": { "code": "document.getElementById('event-log').textContent" } }
```

## 🎓 Learning Resources

- [Electron MCP Server Documentation](../../README.md)
- [MCP Usage Guide](../../MCP_USAGE_GUIDE.md)
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
- [Model Context Protocol](https://modelcontextprotocol.io)

## 📄 License

MIT - Same as the parent Electron MCP Server project
