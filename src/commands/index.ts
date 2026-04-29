import * as click from './click';
import * as evaluation from './eval';
import * as fill from './fill';
import * as hover from './hover';
import * as keyboard from './keyboard';
import * as navigate from './navigate';
import * as query from './query';
import * as scroll from './scroll';
import * as storage from './storage';
import * as wait from './wait';
import type { CommandModule } from './types';

export type { CommandModule } from './types';
export { extractWindowTarget, WindowTargetSchema } from './shared/window-target';

/**
 * Flat list of every `electron_*` command registered in v2.0.0.
 *
 * Order matters for `tools.ts` JSON output (MCP `tools/list` returns them in
 * declaration order). Group by category for readability; alphabetical within.
 */
export const allCommands: ReadonlyArray<CommandModule> = [
  // Query (read-only)
  query.getTitle,
  query.getUrl,
  query.getBodyText,
  query.findElements,
  query.getPageStructure,
  query.debugElements,
  query.verifyFormState,
  query.queryTextBySelector,
  query.queryAttributeBySelector,
  query.queryValueBySelector,
  query.queryVisibleBySelector,
  query.queryEnabledBySelector,

  // Click / mouse (CDP-level mouse events for native compatibility)
  click.clickBySelector,
  click.clickByText,
  click.doubleClickBySelector,
  click.rightClickBySelector,
  click.dragFromTo,

  // Hover (CDP-level mouse events)
  hover.hoverBySelector,
  hover.hoverByText,

  // Fill / Select
  fill.fillInput,
  fill.selectOption,

  // Navigate
  navigate.navigateToHash,

  // Wait / synchronize (MutationObserver + Promise; awaitPromise enabled)
  wait.waitForSelector,
  wait.waitForText,
  wait.waitForNavigation,
  wait.waitForFunction,
  wait.waitForLoadState,

  // Scroll / viewport
  scroll.scrollToElement,
  scroll.scrollByPixels,
  scroll.getViewportSize,
  scroll.getScrollPosition,

  // Keyboard
  keyboard.sendKeyboardShortcut,
  keyboard.pressKey,

  // Storage (localStorage, sessionStorage, cookies)
  storage.localStorageGetItem,
  storage.localStorageSetItem,
  storage.sessionStorageGetItem,
  storage.sessionStorageSetItem,
  storage.clearStorage,

  // Eval / Console (high-risk; uses operationType 'eval')
  evaluation.evalCommand,
  evaluation.consoleLog,
];

/**
 * O(1) lookup table used by `handlers.ts` to dispatch by tool name.
 * Built once at module load.
 */
export const commandsByName: ReadonlyMap<string, CommandModule> = new Map(
  allCommands.map((cmd) => [cmd.name, cmd]),
);
