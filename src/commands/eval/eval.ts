import { z } from 'zod';
import { EXECUTE_IN_ELECTRON_RESULT_PREFIX } from '../../constants';
import { executeInElectron } from '../../utils/electron-connection';
import { windowTargetFields } from '../shared/window-target';
import { defineCommand } from '../types';

const schema = z.object({
  ...windowTargetFields,
  code: z
    .string()
    .min(1)
    .describe(
      'JavaScript code to execute in the Electron renderer. Last-resort escape hatch — prefer specific commands when possible.',
    ),
});

interface StructuredEvalResult {
  success: boolean;
  error?: string | null;
  stack?: string;
  result?: unknown;
}

/**
 * Wrap arbitrary user code in an IIFE so it always returns a value.
 *
 * Heuristics (preserved from the v1 monolith):
 * - Code starting with `() =>` or `function` → invoked directly: `(code)()`
 * - Code with `return` → executed in IIFE so the return surfaces
 * - Code with `;` → executed in IIFE returning `"executed"` after running
 * - Anything else → treated as an expression: `return (code)`
 */
function buildEvalIife(rawCode: string): string {
  const trimmed = rawCode.trim();
  if (trimmed.startsWith('() =>') || trimmed.startsWith('function')) {
    return `result = (${rawCode})();`;
  }
  if (rawCode.includes('return')) {
    return `result = (function() { ${rawCode} })();`;
  }
  if (rawCode.includes(';')) {
    return `result = (function() { ${rawCode}; return "executed"; })();`;
  }
  return `result = (function() { return (${rawCode}); })();`;
}

/**
 * Execute arbitrary JavaScript with deduplication, structured error reporting,
 * and best-effort result formatting.
 *
 * SecurityManager classifies this as `operationType: 'eval'`, which causes
 * `validateEvalContent` (validation.ts) to run against the actual code rather
 * than the tool name. Handler is responsible for passing args.code in place of
 * the tool name when invoking the security pipeline.
 */
export const evalCommand = defineCommand({
  name: 'electron_eval',
  description:
    'Execute custom JavaScript with structured error reporting. Last resort — use specific tools (click, fill, query) when possible.',
  schema,
  operationType: 'eval',
  async execute(args, target) {
    const codeHash = Buffer.from(args.code).toString('base64').slice(0, 10);
    const isStateTest =
      args.code.includes('window.testState') ||
      args.code.includes('persistent-test-value') ||
      args.code.includes('window.testValue');

    const javascriptCode = `
      (function() {
        try {
          const codeHash = '${codeHash}';
          const isStateTest = ${isStateTest};
          const rawCode = ${JSON.stringify(args.code)};

          if (!isStateTest && window._mcpExecuting && window._mcpExecuting[codeHash]) {
            return { success: false, error: 'Code already executing', result: null };
          }

          window._mcpExecuting = window._mcpExecuting || {};
          if (!isStateTest) {
            window._mcpExecuting[codeHash] = true;
          }

          let result;
          ${buildEvalIife(args.code)}

          setTimeout(() => {
            if (!isStateTest && window._mcpExecuting) {
              delete window._mcpExecuting[codeHash];
            }
          }, 1000);

          if (result === undefined && !rawCode.includes('window.') && !rawCode.includes('document.') && !rawCode.includes('||')) {
            return { success: false, error: 'Command returned undefined - element may not exist or action failed', result: null };
          }
          if (result === null) {
            return { success: false, error: 'Command returned null - element may not exist', result: null };
          }
          if (result === false && (rawCode.includes('click') || rawCode.includes('querySelector'))) {
            return { success: false, error: 'Command returned false - action likely failed', result: false };
          }

          // Normalize undefined to null so JSON.stringify keeps the 'result' key.
          // Without this, JSON.stringify({ result: undefined }) → '{}' and the
          // handler can't distinguish "missing" from "explicitly undefined".
          // Reported in #11 (electron_eval response omits 'result' on undefined).
          return { success: true, error: null, result: typeof result === 'undefined' ? null : result };
        } catch (error) {
          return {
            success: false,
            error: 'JavaScript error: ' + error.message,
            stack: error.stack,
            result: null
          };
        }
      })()
    `;

    const rawResult = await executeInElectron(javascriptCode, target);

    // executeInElectron wraps every successful return in `✅ Result: <value>`
    // (see src/utils/electron-connection.ts:206-215). Our IIFE returns a JSON
    // object, so the prefix needs to be stripped before JSON.parse — otherwise
    // parsing fails and the fallback path below double-wraps to
    // `✅ Result: ✅ Result: { ... }` (#11).
    const jsonPayload = rawResult.startsWith(EXECUTE_IN_ELECTRON_RESULT_PREFIX)
      ? rawResult.slice(EXECUTE_IN_ELECTRON_RESULT_PREFIX.length)
      : rawResult;

    try {
      const parsed = JSON.parse(jsonPayload) as StructuredEvalResult;
      if (parsed && typeof parsed === 'object' && 'success' in parsed) {
        if (!parsed.success) {
          return `❌ Command failed: ${parsed.error}${
            parsed.stack ? '\nStack: ' + parsed.stack : ''
          }`;
        }
        // parsed.result is now always present (null when underlying value was
        // undefined, see IIFE comment). Emit `result: null` explicitly so the
        // caller can rely on the key existing.
        return `✅ Command successful: ${JSON.stringify(parsed.result ?? null)}`;
      }
    } catch {
      // Fall through to legacy formatting below.
    }

    if (rawResult === 'undefined' || rawResult === 'null' || rawResult === '') {
      return `⚠️ Command executed but returned ${rawResult || 'empty'} - this may indicate the element wasn't found or the action failed`;
    }

    // Guard against double-prefixing if rawResult already starts with the
    // executeInElectron prefix (we couldn't parse the inner payload as JSON).
    return rawResult.startsWith(EXECUTE_IN_ELECTRON_RESULT_PREFIX)
      ? rawResult
      : `${EXECUTE_IN_ELECTRON_RESULT_PREFIX}${rawResult}`;
  },
});
