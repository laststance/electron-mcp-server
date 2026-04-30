import { describe, it, expect, beforeEach } from 'vitest';
import { InputValidator } from '../../src/security/validation';
import { SecurityLevel } from '../../src/security/config';

/**
 * Unit tests for the eval-content branch of {@link InputValidator.validateCommand}.
 *
 * Covers two regressions found during v2.0.0-rc.1 QA:
 *   - Issue #9: dangerous-keyword screening was short-circuited by `safePatterns`,
 *     letting `process.platform` etc. pass.
 *   - Issue #21: assignment regex flagged `===`/`!==`/`<=`/`>=`/`=>` as assignments.
 *
 * Each test calls `validateCommand` with `operationType: 'eval'` and checks
 * `isValid` plus the surface form of `errors`.
 */
describe('InputValidator.validateCommand (eval payloads)', () => {
  beforeEach(() => {
    // BALANCED is the default profile users hit in production. RC2 fixes target this profile.
    InputValidator.setSecurityLevel(SecurityLevel.BALANCED);
  });

  describe('Issue #9 — dangerous-keyword defense-in-depth', () => {
    const dangerousPayloads = [
      'process.platform',
      'process.env.HOME',
      'process.versions.node',
      'global.someVar',
      'globalThis.foo',
      '__proto__.constructor',
      'require("os")',
    ];

    it.each(dangerousPayloads)('rejects dangerous global access: %s', (code) => {
      const result = InputValidator.validateCommand({
        command: code,
        operationType: 'eval',
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.some((message) => message.includes('Dangerous keyword'))).toBe(true);
      expect(result.riskLevel).toBe('critical');
    });

    const safePayloads = [
      'document.title',
      'window.location.href',
      'Math.PI',
      'Date.now',
      'JSON.stringify',
      // PR #22 CodeRabbit follow-up: the unconditional dangerous-keyword scan
      // previously matched `\burl\b` case-insensitively and rejected the
      // documented `document.URL` shortcut. The narrowed EVAL_CRITICAL_KEYWORDS
      // list (no `url`/`crypto`/`path`/etc.) keeps this safe.
      'document.URL',
      'document.domain',
      'window.location',
    ];

    it.each(safePayloads)('still allows known-safe pattern: %s', (code) => {
      const result = InputValidator.validateCommand({
        command: code,
        operationType: 'eval',
      });

      expect(result.errors).toEqual([]);
      expect(result.isValid).toBe(true);
    });
  });

  describe('Issue #21 — comparison/arrow operators are not assignments', () => {
    const comparisonPayloads = [
      'document.title === "QA Fixture"',
      'document.title !== "x"',
      'document.querySelectorAll("a").length >= 5',
      'document.querySelectorAll("a").length <= 5',
      'document.querySelectorAll("a").length > 0',
      'document.querySelectorAll("a").length < 100',
    ];

    it.each(comparisonPayloads)('does not flag comparison as assignment: %s', (code) => {
      const result = InputValidator.validateCommand({
        command: code,
        operationType: 'eval',
      });

      expect(result.errors.some((message) => message.includes('Assignment operations'))).toBe(
        false,
      );
    });

    it('does not flag arrow functions as assignment', () => {
      // Arrow functions on their own are still rejected for "function calls in eval are restricted",
      // but the assignment check should not contribute. Check the assignment error specifically.
      const result = InputValidator.validateCommand({
        command: 'document.querySelectorAll("a").forEach(a => a.id)',
        operationType: 'eval',
      });

      expect(result.errors.some((message) => message.includes('Assignment operations'))).toBe(
        false,
      );
    });

    it('still rejects real assignments', () => {
      const result = InputValidator.validateCommand({
        command: 'window.foo = 1',
        operationType: 'eval',
      });

      expect(result.errors.some((message) => message.includes('Assignment operations'))).toBe(
        true,
      );
    });
  });

  describe('PR #22 round 2 — compound assignment operators', () => {
    // The previous fix used `/(?<![=!<>])=(?![=>])/`, whose lookbehind only
    // inspects one character. `<<=`, `>>=`, `>>>=` therefore slipped through
    // because the `=` is preceded by `<` or `>`, which sit in the lookbehind
    // exclusion set. The new pattern lists all compound operators explicitly.
    const compoundAssignments = [
      'window.foo += 1',
      'window.foo -= 1',
      'window.foo *= 2',
      'window.foo /= 2',
      'window.foo %= 2',
      'window.foo **= 2',
      'window.foo <<= 1',
      'window.foo >>= 1',
      'window.foo >>>= 1',
      'window.foo &= 1',
      'window.foo |= 1',
      'window.foo ^= 1',
      'window.foo &&= 1',
      'window.foo ||= 1',
      'window.foo ??= 1',
    ];

    it.each(compoundAssignments)('rejects compound assignment: %s', (code) => {
      const result = InputValidator.validateCommand({
        command: code,
        operationType: 'eval',
      });

      expect(result.errors.some((message) => message.includes('Assignment operations'))).toBe(
        true,
      );
    });
  });
});
