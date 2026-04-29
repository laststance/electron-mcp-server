/**
 * Shared input-escaping helpers used when generating JavaScript code that
 * embeds user-supplied strings (selectors, text, hash routes, etc.).
 *
 * Why centralized:
 * - Each command module previously had its own ad-hoc validation. Centralizing
 *   prevents drift and makes it easy to audit the "string -> JS literal" path.
 *
 * Note: the heavy-weight DOM-analysis JS generators stay in
 * `src/utils/electron-commands.ts` and `src/utils/electron-input-commands.ts`
 * for now — Phase 7 may consolidate them, but Phase 1 is structural only.
 */

/**
 * Escape a user string for safe embedding inside generated JavaScript.
 * `JSON.stringify` handles quote escaping and unicode for us.
 * @example
 * escapeJsString(`it's "fine"`) // => `"it's \\"fine\\""`
 */
export function escapeJsString(input: string): string {
  return JSON.stringify(input);
}

/**
 * Lightweight "is this string suspicious as a selector or hash" check.
 * Used by commands that embed user strings into JS without quoting (rare).
 * Returns true when the input contains obvious code-injection markers.
 */
export function containsDangerousContent(input: string): boolean {
  const lowered = input.toLowerCase();
  return lowered.includes('javascript:') || lowered.includes('<script');
}
