# Migrating from v1.x to v2.0

> **TL;DR** — v2.0 splits the single `send_command_to_electron` tool into ~40
> individual `electron_*` tools. This dramatically improves LLM tool selection
> accuracy (m13v's measurements: 20% error rate → <3%). Every v1 subcommand has
> a 1-to-1 v2 replacement.

---

## Why this breaks

In v1, every UI action went through one tool:

```jsonc
// v1 — wrapped subcommand
{
  "tool": "send_command_to_electron",
  "args": {
    "command": "click_by_selector",
    "args": { "selector": "button.submit" }
  }
}
```

LLMs saw this as **one** tool and had to pack the operation type into a
nested `args.command` field. The model had to guess the right subcommand name
from a long list buried in the tool description, then build the correct
`args.args` object. Selection error rate was high (20%+ in measured runs),
and arg-shape errors compounded the problem.

In v2, each operation is a top-level MCP tool with its own JSON schema:

```jsonc
// v2 — direct tool
{
  "tool": "electron_click_by_selector",
  "args": { "selector": "button.submit" }
}
```

The MCP host (Claude Code, Cline, etc.) can now match user intent against ~40
descriptive tool names with proper schemas. Field validation happens at the
MCP layer instead of inside our handler.

---

## Migration table

Translate every v1 `send_command_to_electron` call into the v2 tool that
replaces it. The arguments your sub-command used to take are now top-level
fields on the v2 tool — drop the `command` / `args` wrapper and pass them
directly. **Exception:** the wrapper-level window targeting fields (`targetId`
/ `windowTitle`) move INTO each tool's arguments rather than disappearing.
See [Multi-window targeting](#multi-window-targeting) below.

| v1 subcommand                 | v2 tool                                  | Notes                                                                 |
| ----------------------------- | ---------------------------------------- | --------------------------------------------------------------------- |
| `get_title`                   | `electron_get_title`                     |                                                                       |
| `get_url`                     | `electron_get_url`                       |                                                                       |
| `get_body_text`               | `electron_get_body_text`                 |                                                                       |
| `find_elements`               | `electron_find_elements`                 |                                                                       |
| `get_page_structure`          | `electron_get_page_structure`            |                                                                       |
| `debug_elements`              | `electron_debug_elements`                |                                                                       |
| `verify_form_state`           | `electron_verify_form_state`             |                                                                       |
| `click_by_selector`           | `electron_click_by_selector`             |                                                                       |
| `click_by_text`               | `electron_click_by_text`                 |                                                                       |
| `click_button`                | `electron_click_by_selector`             | Pass `selector: "button"` to keep v1 default behavior.                |
| `hover_by_selector`           | `electron_hover_by_selector`             | Same CDP-level mouse events as v1.                                    |
| `hover_by_text`               | `electron_hover_by_text`                 |                                                                       |
| `fill_input`                  | `electron_fill_input`                    | Pass either `selector` or `placeholder`.                              |
| `select_option`               | `electron_select_option`                 | Pass either `selector` or `text` plus `value`.                        |
| `navigate_to_hash`            | `electron_navigate_to_hash`              |                                                                       |
| `send_keyboard_shortcut`      | `electron_send_keyboard_shortcut`        | For real CDP key events (cursor, IME), prefer `electron_press_key`.   |
| `eval`                        | `electron_eval`                          | Same security pipeline (validateEvalContent runs against the code).   |
| `console_log`                 | `electron_console_log`                   |                                                                       |

### New in v2 (no v1 equivalent)

These were added during the split to fill obvious gaps. None of them have a
v1 counterpart — they're new capabilities.

| Category | New tool | What it does |
| -------- | -------- | ------------ |
| Element state queries | `electron_query_text_by_selector` | Read `element.textContent`. |
| | `electron_query_attribute_by_selector` | Read `element.getAttribute(name)`. |
| | `electron_query_value_by_selector` | Read `element.value` (input/textarea/select). |
| | `electron_query_visible_by_selector` | Boolean: rendered with non-zero size and visible CSS. |
| | `electron_query_enabled_by_selector` | Boolean: form control not disabled. |
| Synchronization | `electron_wait_for_selector` | MutationObserver-backed wait until selector matches. |
| | `electron_wait_for_text` | Wait until substring appears in `document.body`. |
| | `electron_wait_for_navigation` | Wait for URL change (with optional substring match). |
| | `electron_wait_for_function` | Poll a JS expression until truthy (validated as eval). |
| | `electron_wait_for_load_state` | Wait for `load` / `domcontentloaded` / `networkidle`. |
| Mouse / keyboard | `electron_double_click_by_selector` | CDP `clickCount: 2` double click. |
| | `electron_right_click_by_selector` | CDP `button: 'right'`. |
| | `electron_drag_from_to` | Source → target drag with intermediate moves (works with react-dnd, dnd-kit). |
| | `electron_press_key` | Single-key press via CDP `Input.dispatchKeyEvent`. |
| Scroll / viewport | `electron_scroll_to_element` | `Element.scrollIntoView`, defaults to `block: 'center'`. |
| | `electron_scroll_by_pixels` | `window.scrollBy` with delta. |
| | `electron_get_viewport_size` | `{ width, height, devicePixelRatio }`. |
| | `electron_get_scroll_position` | `{ scrollX, scrollY, maxScrollX, maxScrollY }`. |
| Storage | `electron_local_storage_get_item` | Single-key `localStorage.getItem`. |
| | `electron_local_storage_set_item` | Single-key `localStorage.setItem`. |
| | `electron_session_storage_get_item` | Single-key `sessionStorage.getItem`. |
| | `electron_session_storage_set_item` | Single-key `sessionStorage.setItem`. |
| | `electron_clear_storage` | Clear local / session / cookies (best-effort). |

### Unchanged across v1 → v2

These four tools kept their names and schemas. No migration needed:

- `get_electron_window_info`
- `list_electron_windows`
- `take_screenshot`
- `read_electron_logs`

---

## Side-by-side examples

### Click a button

```jsonc
// v1
{
  "tool": "send_command_to_electron",
  "args": { "command": "click_by_selector", "args": { "selector": "#login" } }
}

// v2
{
  "tool": "electron_click_by_selector",
  "args": { "selector": "#login" }
}
```

### Fill an input

```jsonc
// v1
{
  "tool": "send_command_to_electron",
  "args": {
    "command": "fill_input",
    "args": { "placeholder": "Email", "value": "user@example.com" }
  }
}

// v2
{
  "tool": "electron_fill_input",
  "args": { "placeholder": "Email", "value": "user@example.com" }
}
```

### Run arbitrary JS

```jsonc
// v1
{
  "tool": "send_command_to_electron",
  "args": { "command": "eval", "args": { "code": "document.title" } }
}

// v2
{
  "tool": "electron_eval",
  "args": { "code": "document.title" }
}
```

---

## Multi-window targeting

Both `targetId` and `windowTitle` arguments still work, on every command that
operates on a window. They're now part of every `electron_*` tool's schema
rather than wrapped at the `send_command_to_electron` level:

```jsonc
{
  "tool": "electron_click_by_selector",
  "args": {
    "selector": "button.save",
    "windowTitle": "Settings"
  }
}
```

---

## Security levels

`SECURITY_LEVEL` env var (`strict` / `balanced` / `permissive` / `development`)
behavior is unchanged. Each v2 tool carries an `operationType` (`command` /
`query` / `eval`) that the SecurityManager classifies the same way it
classified v1 subcommands.

`electron_eval` and `electron_wait_for_function` are routed through the eval
validation pipeline (`validateEvalContent` runs against the actual JS code,
not the tool name) so the `strict` and `balanced` blocking semantics carry
over without changes.

---

## What if I'm still on v1.x?

The `1.x` line will receive critical security fixes for ~3 months after
2.0.0 stable releases. After that, v1 is unsupported. Plan to migrate.

To pin to v1:

```bash
npm install @laststance/electron-mcp-server@^1.7
```

To opt into v2 release candidates:

```bash
npm install @laststance/electron-mcp-server@rc
```

---

## Reporting issues

If you hit a v2-specific issue, open a GitHub issue with the v1 → v2
mapping you used and the actual MCP tool call that failed:
https://github.com/laststance/electron-mcp-server/issues
