/**
 * Centralized constants for @laststance/electron-mcp-server.
 *
 * Convention: SCREAMING_SNAKE_CASE with unit suffix (`_MS`, `_PORT`, etc.).
 * Keep this file dependency-free — it must be safe to import from any layer.
 */

/** Default timeout for any single CDP request (Runtime.evaluate, Input.dispatch...). */
export const CDP_TIMEOUT_MS = 10000;

/** Maximum time to wait for a WebSocket to reach OPEN state. */
export const CDP_CONNECT_TIMEOUT_MS = 5000;

/** Default Chrome DevTools Protocol port that Electron exposes. */
export const DEFAULT_CDP_PORT = 9222;

/** Range of ports scanned by `scanForElectronApps`. */
export const CDP_PORT_SCAN_START = 9222;
export const CDP_PORT_SCAN_END = 9230;

/** Internal sentinel range for pool-managed CDP message IDs. Pool starts here. */
export const CDP_POOL_MESSAGE_ID_START = 1;

/**
 * Rate-limit window for `electron_click_by_selector`. Same selector clicks
 * within this window return "Click prevented - too soon after previous click"
 * to suppress accidental double-firing in React event handlers.
 */
export const CLICK_BY_SELECTOR_RATE_LIMIT_MS = 1000;

/**
 * Rate-limit window for `electron_click_by_text` (renderer-side debounce in
 * `generateClickByTextCommand`). Longer than the selector variant because
 * text scoring + scrollIntoView animations can legitimately take ~1s, and
 * the previous threshold (2000ms) was tuned empirically for React forms.
 */
export const CLICK_BY_TEXT_RATE_LIMIT_MS = 2000;

/**
 * Prefix that `executeInElectron` (src/utils/electron-connection.ts) prepends
 * to every successful Runtime.evaluate result string. Centralized here so
 * `electron_eval` can detect the wrapper and avoid double-prefixing
 * (`✅ Result: ✅ Result: ...`) when its IIFE return is fed back through the
 * same helper. See #11 for the original double-prefix bug.
 */
export const EXECUTE_IN_ELECTRON_RESULT_PREFIX = '✅ Result: ';
