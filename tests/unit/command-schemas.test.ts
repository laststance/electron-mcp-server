import { describe, it, expect } from 'vitest';
import { commandsByName } from '../../src/commands';

/**
 * Schema-only tests. Confirms each command's Zod schema enforces required
 * fields and applies sensible defaults. We do not invoke `execute` here —
 * those would require a live CDP connection or a heavier mock surface.
 */

describe('command schemas (Phase 1-6)', () => {
  describe('electron_query_text_by_selector', () => {
    const schema = commandsByName.get('electron_query_text_by_selector')!.schema;

    it('rejects missing selector', () => {
      expect(() => schema.parse({})).toThrow();
    });

    it('rejects empty selector', () => {
      expect(() => schema.parse({ selector: '' })).toThrow();
    });

    it('accepts a valid selector', () => {
      expect(() => schema.parse({ selector: '.foo' })).not.toThrow();
    });
  });

  describe('electron_query_attribute_by_selector', () => {
    const schema = commandsByName.get('electron_query_attribute_by_selector')!.schema;

    it('rejects missing attributeName', () => {
      expect(() => schema.parse({ selector: '.foo' })).toThrow();
    });

    it('accepts selector + attributeName', () => {
      const parsed = schema.parse({ selector: 'a', attributeName: 'href' });
      expect(parsed.attributeName).toBe('href');
    });
  });

  describe('electron_wait_for_selector', () => {
    const schema = commandsByName.get('electron_wait_for_selector')!.schema;

    it('applies default timeoutMs when omitted', () => {
      const parsed = schema.parse({ selector: '#x' });
      expect(parsed.timeoutMs).toBe(5000);
    });

    it('rejects timeoutMs above the cap', () => {
      expect(() => schema.parse({ selector: '#x', timeoutMs: 999_999 })).toThrow();
    });

    it('rejects negative timeoutMs', () => {
      expect(() => schema.parse({ selector: '#x', timeoutMs: -1 })).toThrow();
    });
  });

  describe('electron_wait_for_load_state', () => {
    const schema = commandsByName.get('electron_wait_for_load_state')!.schema;

    it('defaults to state="load" with 30s timeout', () => {
      const parsed = schema.parse({});
      expect(parsed.state).toBe('load');
      expect(parsed.timeoutMs).toBe(30000);
    });

    it('rejects unknown state values', () => {
      expect(() => schema.parse({ state: 'idle' })).toThrow();
    });

    it('accepts the three Playwright-style states', () => {
      for (const state of ['load', 'domcontentloaded', 'networkidle']) {
        expect(() => schema.parse({ state })).not.toThrow();
      }
    });
  });

  describe('electron_press_key', () => {
    const schema = commandsByName.get('electron_press_key')!.schema;

    it('accepts a single key without modifiers', () => {
      expect(() => schema.parse({ key: 'a' })).not.toThrow();
    });

    it('rejects unknown modifiers', () => {
      expect(() => schema.parse({ key: 'a', modifiers: ['Hyper'] })).toThrow();
    });

    it('accepts the four supported modifiers', () => {
      const parsed = schema.parse({ key: 'a', modifiers: ['Ctrl', 'Shift', 'Alt', 'Meta'] });
      expect(parsed.modifiers).toEqual(['Ctrl', 'Shift', 'Alt', 'Meta']);
    });
  });

  describe('electron_clear_storage', () => {
    const schema = commandsByName.get('electron_clear_storage')!.schema;

    it('rejects empty scopes array', () => {
      expect(() => schema.parse({ scopes: [] })).toThrow();
    });

    it('rejects unknown scope names', () => {
      expect(() => schema.parse({ scopes: ['indexeddb'] })).toThrow();
    });

    it('accepts every documented scope', () => {
      for (const scope of ['local', 'session', 'cookies']) {
        expect(() => schema.parse({ scopes: [scope] })).not.toThrow();
      }
    });
  });

  describe('electron_drag_from_to', () => {
    const schema = commandsByName.get('electron_drag_from_to')!.schema;

    it('rejects missing toSelector', () => {
      expect(() => schema.parse({ fromSelector: '.a' })).toThrow();
    });

    it('rejects both selectors empty', () => {
      expect(() => schema.parse({ fromSelector: '', toSelector: '' })).toThrow();
    });

    it('accepts well-formed input', () => {
      const parsed = schema.parse({ fromSelector: '.src', toSelector: '.dst' });
      expect(parsed.fromSelector).toBe('.src');
      expect(parsed.toSelector).toBe('.dst');
    });
  });

  describe('electron_scroll_by_pixels', () => {
    const schema = commandsByName.get('electron_scroll_by_pixels')!.schema;

    it('defaults deltaX/deltaY to 0 and behavior to "auto"', () => {
      const parsed = schema.parse({});
      expect(parsed.deltaX).toBe(0);
      expect(parsed.deltaY).toBe(0);
      expect(parsed.behavior).toBe('auto');
    });

    it('rejects non-integer deltas', () => {
      expect(() => schema.parse({ deltaY: 1.5 })).toThrow();
    });
  });

  describe('electron_select_option', () => {
    const schema = commandsByName.get('electron_select_option')!.schema;

    it('rejects when neither selector nor text is provided', () => {
      expect(() => schema.parse({ value: 'x' })).toThrow();
    });

    it('accepts selector path', () => {
      expect(() => schema.parse({ value: 'x', selector: 'select' })).not.toThrow();
    });

    it('accepts text path', () => {
      expect(() => schema.parse({ value: 'x', text: 'Country' })).not.toThrow();
    });
  });

  describe('electron_fill_input', () => {
    const schema = commandsByName.get('electron_fill_input')!.schema;

    it('rejects when neither selector nor placeholder is provided', () => {
      expect(() => schema.parse({ value: 'hi' })).toThrow();
    });
  });
});
