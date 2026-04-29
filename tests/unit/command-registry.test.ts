import { describe, it, expect } from 'vitest';
import { allCommands, commandsByName } from '../../src/commands';

const ELECTRON_PREFIX = 'electron_';
const ALLOWED_OPERATION_TYPES = new Set(['command', 'query', 'eval']);

describe('command registry (Phase 1-6)', () => {
  it('exposes a non-empty registry', () => {
    expect(allCommands.length).toBeGreaterThan(0);
  });

  it('every command has a non-empty name starting with electron_', () => {
    for (const command of allCommands) {
      expect(command.name, 'each command needs a name').toBeTruthy();
      expect(command.name.startsWith(ELECTRON_PREFIX)).toBe(true);
    }
  });

  it('every command name is unique', () => {
    const seenNames = new Set<string>();
    for (const command of allCommands) {
      expect(seenNames.has(command.name), `duplicate command name: ${command.name}`).toBe(false);
      seenNames.add(command.name);
    }
  });

  it('every command has a non-empty description', () => {
    for (const command of allCommands) {
      expect(command.description, `description missing for ${command.name}`).toBeTruthy();
      expect(command.description.length).toBeGreaterThan(10);
    }
  });

  it('every command has a recognized operationType', () => {
    for (const command of allCommands) {
      expect(
        ALLOWED_OPERATION_TYPES.has(command.operationType),
        `unknown operationType "${command.operationType}" on ${command.name}`,
      ).toBe(true);
    }
  });

  it('every command has a Zod schema with .parse', () => {
    for (const command of allCommands) {
      expect(typeof command.schema.parse, `${command.name} missing schema.parse`).toBe('function');
    }
  });

  it('commandsByName lookup is consistent with allCommands', () => {
    expect(commandsByName.size).toBe(allCommands.length);
    for (const command of allCommands) {
      expect(commandsByName.get(command.name)).toBe(command);
    }
  });

  it('includes representative commands from every Phase 1-6 category', () => {
    const expectedCommands = [
      'electron_get_title',
      'electron_query_text_by_selector',
      'electron_click_by_selector',
      'electron_double_click_by_selector',
      'electron_drag_from_to',
      'electron_hover_by_selector',
      'electron_fill_input',
      'electron_select_option',
      'electron_navigate_to_hash',
      'electron_wait_for_selector',
      'electron_wait_for_function',
      'electron_scroll_to_element',
      'electron_get_viewport_size',
      'electron_send_keyboard_shortcut',
      'electron_press_key',
      'electron_local_storage_get_item',
      'electron_session_storage_set_item',
      'electron_clear_storage',
      'electron_eval',
      'electron_console_log',
    ];
    for (const expectedName of expectedCommands) {
      expect(commandsByName.has(expectedName), `${expectedName} not registered`).toBe(true);
    }
  });

  it('only the eval-class commands use operationType "eval"', () => {
    const evalCommandNames = allCommands
      .filter((command) => command.operationType === 'eval')
      .map((command) => command.name)
      .sort();
    expect(evalCommandNames).toEqual(['electron_eval', 'electron_wait_for_function']);
  });
});
