# MCP Usage Examples for Electron MCP Server

This document provides comprehensive examples of how to properly use the Electron MCP Server tools.

## 🎯 Common Patterns

### Getting Started - Page Inspection

Always start by understanding the page structure:

```json
{
  "command": "get_page_structure"
}
```

This returns all interactive elements with their properties, helping you choose the right targeting method.

### Button Interactions

#### Method 1: Click by Visible Text (Recommended)

```json
{
  "command": "click_by_text",
  "args": {
    "text": "Create New Encyclopedia"
  }
}
```

#### Method 2: Click by CSS Selector

```json
{
  "command": "click_by_selector",
  "args": {
    "selector": "button[class*='bg-blue-500']"
  }
}
```

### Form Interactions

#### Fill Input by Placeholder

```json
{
  "command": "fill_input",
  "args": {
    "placeholder": "Enter encyclopedia name",
    "value": "AI and Machine Learning"
  }
}
```

#### Fill Input by CSS Selector

```json
{
  "command": "fill_input",
  "args": {
    "selector": "#email",
    "value": "user@example.com"
  }
}
```

### Keyboard Shortcuts

```json
{
  "command": "send_keyboard_shortcut",
  "args": {
    "text": "Ctrl+N"
  }
}
```

### Custom JavaScript

```json
{
  "command": "eval",
  "args": {
    "code": "document.querySelectorAll('button').length"
  }
}
```

## 🚨 Common Mistakes and Fixes

### ❌ Mistake 1: Wrong Argument Structure

```json
// WRONG - causes "selector is empty" error
{
  "command": "click_by_selector",
  "args": "button.submit"
}

// CORRECT
{
  "command": "click_by_selector",
  "args": {
    "selector": "button.submit"
  }
}
```

### ❌ Mistake 2: Using Complex Selectors Incorrectly

```json
// WRONG - invalid CSS syntax
{
  "command": "click_by_selector",
  "args": {
    "selector": "button:has-text('Create')"
  }
}

// CORRECT - use click_by_text instead
{
  "command": "click_by_text",
  "args": {
    "text": "Create"
  }
}
```

### ❌ Mistake 3: Not Handling React/Dynamic Content

```json
// BETTER - wait and retry pattern
{
  "command": "get_page_structure"
}
// Check if elements loaded, then:
{
  "command": "click_by_selector",
  "args": {
    "selector": "button[data-testid='submit']"
  }
}
```

## 🔄 Complete Workflow Examples

### Example 1: Creating a New Item in an App

```json
// 1. Take a screenshot to see current state
{
  "tool": "take_screenshot"
}

// 2. Understand the page structure
{
  "tool": "send_command_to_electron",
  "args": {
    "command": "get_page_structure"
  }
}

// 3. Click the "Create" button
{
  "tool": "send_command_to_electron",
  "args": {
    "command": "click_by_text",
    "args": {
      "text": "Create New"
    }
  }
}

// 4. Fill in the form
{
  "tool": "send_command_to_electron",
  "args": {
    "command": "fill_input",
    "args": {
      "placeholder": "Enter name",
      "value": "My New Item"
    }
  }
}

// 5. Submit the form
{
  "tool": "send_command_to_electron",
  "args": {
    "command": "click_by_selector",
    "args": {
      "selector": "button[type='submit']"
    }
  }
}

// 6. Verify success
{
  "tool": "take_screenshot"
}
```

### Example 2: Debugging Element Issues

```json
// 1. Get all button information
{
  "tool": "send_command_to_electron",
  "args": {
    "command": "debug_elements"
  }
}

// 2. Check specific element properties
{
  "tool": "send_command_to_electron",
  "args": {
    "command": "eval",
    "args": {
      "code": "Array.from(document.querySelectorAll('button')).map(btn => ({text: btn.textContent, classes: btn.className, visible: btn.offsetParent !== null}))"
    }
  }
}

// 3. Try alternative targeting method
{
  "tool": "send_command_to_electron",
  "args": {
    "command": "click_by_text",
    "args": {
      "text": "Submit"
    }
  }
}
```

## 💡 Best Practices

### 1. Always Verify Element Existence

```json
{
  "command": "eval",
  "args": {
    "code": "document.querySelector('button.submit') ? 'Element exists' : 'Element not found'"
  }
}
```

### 2. Use Text-Based Targeting When Possible

Text-based targeting is more resilient to UI changes:

```json
{
  "command": "click_by_text",
  "args": {
    "text": "Save"
  }
}
```

### 3. Fallback Strategies

```json
// Try text first
{
  "command": "click_by_text",
  "args": {
    "text": "Submit"
  }
}

// If that fails, try selector
{
  "command": "click_by_selector",
  "args": {
    "selector": "button[type='submit']"
  }
}
```

### 4. Handle Dynamic Content

```json
// Check if content is loaded
{
  "command": "eval",
  "args": {
    "code": "document.querySelector('.loading') ? 'Still loading' : 'Ready'"
  }
}
```

## 🛠️ Security Considerations

### Safe JavaScript Execution

```json
// SAFE - simple property access
{
  "command": "eval",
  "args": {
    "code": "document.title"
  }
}

// AVOID - complex operations that might be blocked
{
  "command": "eval",
  "args": {
    "code": "fetch('/api/data').then(r => r.json())"
  }
}
```

### Use Built-in Commands

Prefer built-in commands over eval when possible:

```json
// BETTER
{
  "command": "get_title"
}

// INSTEAD OF
{
  "command": "eval",
  "args": {
    "code": "document.title"
  }
}
```

## 📝 Tool Reference Summary

| Tool                       | Purpose        | Key Arguments                               |
| -------------------------- | -------------- | ------------------------------------------- |
| `get_electron_window_info` | Get app info   | `includeChildren: boolean`                  |
| `take_screenshot`          | Capture screen | `windowTitle?: string, outputPath?: string` |
| `send_command_to_electron` | UI interaction | `command: string, args: object`             |
| `read_electron_logs`       | View logs      | `logType?: string, lines?: number`          |

Remember: Always structure arguments as objects with the appropriate properties for each command!
