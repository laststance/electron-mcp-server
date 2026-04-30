# QA Fixture for `@laststance/electron-mcp-server`

Minimal Electron app that exercises the corner cases the main QA target
(`~/laststance/skills-desktop`) cannot easily reproduce: multi-window,
`nodeIntegration:true`, native form widgets, drag-and-drop, large scroll surfaces,
hover tooltips, web storage, hash routing, custom context menus, and menu hotkeys.

Tracked by [Issue #13](https://github.com/laststance/electron-mcp-server/issues/13).
This package is **not published**: the parent package's `files` allow-list excludes
`playground/`.

## Install & launch

```bash
cd playground/qa-fixture
pnpm install        # or `npm install` — independent package, both work
pnpm dev            # CDP on port 9223 (skills-desktop sits on 9222)

# Issue #9 reproduction (validateEvalContent shortcircuit) — env var works in dev
QA_FIXTURE_UNSAFE=1 pnpm dev

# Or, when running the built app directly:
pnpm build && pnpm exec electron . --unsafe-node-integration
```

Press `Cmd+N` to open a secondary window. `Cmd+Shift+N` toggles `nodeIntegration`
**only when running the built app** — in dev mode kill the process and re-launch
with the opposite `QA_FIXTURE_UNSAFE` value (electron-vite's cac parser blocks
arbitrary CLI flags, and `app.relaunch` cannot override env vars).

## QA recipes

All examples assume the MCP server is connected and you're driving it from a Claude
Code session. Replace `<targetId>` with values returned by
`list_electron_windows`. Routes are HashRouter paths — navigate via
`electron_navigate_to_hash` or by clicking the in-app nav links.

### 1. Multi-window — `targetId` vs `windowTitle` precedence

```text
1. Launch fixture → primary window opens at #/
2. Cmd+N → secondary window opens at #/secondary
3. list_electron_windows → expect 2 entries (titles include "Primary" and "Secondary")
4. electron_get_title with targetId only → matches that window's title
5. electron_get_title with windowTitle:"Secondary" → matches the secondary window
6. electron_get_title with both targetId(primary) and windowTitle:"Secondary"
   → expected behaviour: targetId wins (verify behaviour matches docs)
```

### 2. `nodeIntegration:true` — Issue #9 reproduction

```bash
# Re-launch in unsafe mode (dev — env var, since cac strips unknown flags)
QA_FIXTURE_UNSAFE=1 pnpm dev
```

```text
electron_eval('process.platform')
  → CURRENT (rc.1): returns "darwin" — validation shortcircuit lets it pass
  → AFTER FIX:      blocked with "Dangerous keyword detected: process"
```

Test additional payloads to flesh out the eval validation regression suite:

```text
electron_eval('global.x = 1')
electron_eval('globalThis.foo')
electron_eval('__proto__')
electron_eval('require("os").platform()')
```

### 3. Form widgets — `select_option`, `verify_form_state`

```text
navigate_to_hash → /forms

electron_click_by_selector  '[data-testid="radio-beta"]'
electron_query_value_by_selector '[data-testid="radio-current"]' → "selected: beta"

electron_select_option '[data-testid="single-select"]' value:"de"
electron_select_option '[data-testid="multi-select"]' value:["react", "solid"]

electron_query_enabled_by_selector '[data-testid="disabled-input"]' → false
electron_query_visible_by_selector '[data-testid="hidden-input"]' → false
```

### 4. Drag-and-drop — `drag_from_to`

```text
navigate_to_hash → /drag

electron_drag_from_to
  source:'[data-testid="drag-item-item-1"]'
  target:'[data-testid="drag-target"]'

electron_query_text_by_selector '[data-testid="drag-status"]'
  → "Source size: 2 / Target size: 1"
```

### 5. Scroll — `scroll_*`, `get_scroll_position`

```text
navigate_to_hash → /scroll

electron_scroll_to_element '[data-testid="scroll-target-bottom-right"]'
electron_get_scroll_position selector:'[data-testid="scroll-viewport"]'
  → near {x: 2600, y: 2600}

electron_scroll_by_pixels selector:'[data-testid="scroll-viewport"]' x:-2600 y:-2600
electron_query_text_by_selector '[data-testid="scroll-x"]' → "0"
```

### 6. Hover — `hover_by_selector`, `hover_by_text`

```text
navigate_to_hash → /hover

electron_hover_by_selector '[data-testid="hover-btn-save"]'
electron_query_text_by_selector '[data-testid="hover-active"]' → "save"

electron_hover_by_text "delete"
electron_query_text_by_selector '[data-testid="hover-active"]' → "delete"
```

### 7. Storage — `local_storage_*`, `session_storage_*`, `clear_storage`

```text
navigate_to_hash → /storage

electron_local_storage_set_item key:"theme" value:"dark"
electron_local_storage_get_item key:"theme" → "dark"

electron_clear_storage          # all keys cleared
electron_local_storage_get_item key:"theme" → null
```

### 8. Hash routing — `navigate_to_hash`, `wait_for_navigation`

```text
electron_navigate_to_hash hash:"/forms"
electron_wait_for_navigation
electron_query_text_by_selector '[data-testid="current-path"]' → "/forms"
```

### 9. Context menu — `right_click_by_selector`

```text
navigate_to_hash → /context

electron_right_click_by_selector '[data-testid="context-target"]'
electron_query_visible_by_selector '[data-testid="context-menu"]' → true

electron_click_by_selector '[data-testid="context-action-paste"]'
electron_query_text_by_selector '[data-testid="context-last-action"]' → "Paste"
```

### 10. App hotkey via menu — `send_keyboard_shortcut`

```text
electron_send_keyboard_shortcut keys:["Meta", "n"]
list_electron_windows → expect 2 windows now
```

## Smoke matrix (RC2 / RC3 → GA gate)

Before tagging `2.0.0`, run all 10 recipes above against the fixture. Issues #9–#12
fixes should each be verified through the relevant recipe (`#9` → recipe 2, `#11` →
storage / form recipes that exercise undefined return values, `#12` → recipe 6 for
hover/keyboard interplay).

## Out of scope here

- CI integration wiring (the `tests/integration/` revival is a separate issue).
- Visual polish — readability only.
- Real backend traffic — `wait_for_load_state` networkidle tests can use a mock
  fetch added later if needed.
