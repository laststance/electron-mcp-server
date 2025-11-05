# MCP Security Configuration

The MCP Electron server uses a **BALANCED** security level that provides an optimal balance between security and functionality.

## Security Level: BALANCED (Default)

The server automatically uses the BALANCED security level, which:

- Allows safe UI interactions and DOM queries
- Blocks dangerous operations like eval and assignments
- Provides good balance between security and functionality
- Cannot be overridden by environment variables for security consistency

## Security Features

- ✅ Safe UI interactions (clicking, focusing elements)
- ✅ DOM queries (reading element properties)
- ✅ Property access (reading values)
- ❌ Assignment operations (security risk)
- ❌ Function calls in eval (injection risk)
- ❌ Constructor calls (potential exploit vector)

## Usage Examples

Based on your logs, you want to interact with UI elements. Use these secure commands instead of raw eval:

### ✅ Secure Ways to Interact:

```javascript
// Instead of: document.querySelector('button').click()
command: 'click_by_selector';
args: {
  selector: "button[title='Create New Encyclopedia']";
}

// Instead of: document.querySelector('[title="Create New Encyclopedia"]').click()
command: 'click_by_text';
args: {
  text: 'Create New Encyclopedia';
}

// Instead of: location.hash = '#create'
command: 'navigate_to_hash';
args: {
  text: 'create';
}

// Instead of: new KeyboardEvent('keydown', {...})
command: 'send_keyboard_shortcut';
args: {
  text: 'Ctrl+N';
}
```

### ❌ What Gets Blocked (and why):

```javascript
// ❌ Raw function calls in eval
document.querySelector('[title="Create New Encyclopedia"]').click();
// Reason: Function calls are restricted for security

// ❌ Assignment operations
location.hash = '#create';
// Reason: Assignment operations can be dangerous

// ❌ Constructor calls
new KeyboardEvent('keydown', { key: 'n', metaKey: true });
// Reason: Constructor calls can be used for code injection
```

## Configuration in Code

The security level is automatically set to BALANCED and cannot be changed:

```typescript
import { SecurityManager } from './security/manager';

// SecurityManager automatically uses BALANCED security level
const securityManager = new SecurityManager();

// Security level is fixed and cannot be changed at runtime
// This ensures consistent security across all deployments
```
