import { z } from 'zod';
import { executeInElectron } from '../../utils/electron-connection';
import { windowTargetFields } from '../shared/window-target';
import { defineCommand } from '../types';

const DEFAULT_TIMEOUT_MS = 5000;
const HARD_TIMEOUT_BUFFER_MS = 2000;
const POLL_INTERVAL_MS = 100;

const schema = z.object({
  ...windowTargetFields,
  code: z
    .string()
    .min(1)
    .describe(
      'JavaScript expression to poll. Should return a truthy value when the wait condition is met.',
    ),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .max(60000)
    .default(DEFAULT_TIMEOUT_MS)
    .describe('Maximum wait in milliseconds (default 5000, capped at 60000).'),
});

/**
 * Repeatedly evaluate a user-provided JavaScript expression until it returns
 * a truthy value (or the timeout fires).
 *
 * Why `operationType: 'eval'`:
 * - The expression IS user-controlled JS — the same risk surface as
 *   `electron_eval`. Routing through the eval security pipeline ensures
 *   `validateEvalContent` runs against the actual code.
 * - The handler dispatch reads `parsed.code` for eval commands; we use the
 *   field name `code` here to match.
 *
 * Resolution strings:
 * - `Condition met: <stringified result> (waited <ms>ms)`
 * - `Timeout: condition did not become truthy within <ms>ms`
 * - `Error in expression: <message>` if evaluation throws
 *
 * Polls every 100ms via `setInterval`; the wrapped expression runs inside a
 * `try/catch` so transient errors (e.g. a property not yet defined) don't
 * abort the wait.
 */
export const waitForFunction = defineCommand({
  name: 'electron_wait_for_function',
  description:
    'Poll a JS expression until it returns truthy. operationType=eval (validated). Default 5000ms, polled every 100ms.',
  schema,
  operationType: 'eval',
  async execute(args, target) {
    const timeoutMs = args.timeoutMs;
    const expressionLiteral = JSON.stringify(args.code);

    // \`poller\` and \`timer\` need to be declared BEFORE \`tryOnce\` runs the
    // first time. If the expression is already truthy on the first call,
    // \`finish\` clears the (still-uninitialized) const bindings and trips the
    // TDZ — the error is swallowed inside the try/catch and the wait silently
    // hangs until the hard CDP timeout. Use \`let\` and guard the cleanup so
    // the synchronous-resolution path works.
    const javascriptCode = `
      (function() {
        return new Promise((resolve) => {
          const start = Date.now();
          const expression = ${expressionLiteral};
          const timeoutMs = ${timeoutMs};
          const evaluator = new Function('return (' + expression + ')');

          let poller;
          let timer;
          let resolved = false;
          // Capture the most recent evaluator error so a permanently-invalid
          // expression surfaces a real reason instead of a confusing timeout.
          let lastError = null;
          const finish = (msg) => {
            if (resolved) return;
            resolved = true;
            if (poller) clearInterval(poller);
            if (timer) clearTimeout(timer);
            resolve(msg);
          };

          const tryOnce = () => {
            try {
              const value = evaluator();
              if (value) {
                let printed;
                try { printed = JSON.stringify(value); } catch (e) { printed = String(value); }
                finish('Condition met: ' + printed + ' (waited ' + (Date.now() - start) + 'ms)');
              }
            } catch (e) {
              // Swallow transient errors so polling continues — but remember
              // the last one to report on timeout.
              lastError = e && e.message ? e.message : String(e);
            }
          };

          tryOnce();
          if (resolved) return;
          poller = setInterval(tryOnce, ${POLL_INTERVAL_MS});
          timer = setTimeout(() => {
            if (lastError) {
              finish('Error in expression: ' + lastError);
              return;
            }
            finish('Timeout: condition did not become truthy within ' + timeoutMs + 'ms');
          }, timeoutMs);
        });
      })()
    `;

    return executeInElectron(javascriptCode, target, {
      awaitPromise: true,
      timeoutMs: timeoutMs + HARD_TIMEOUT_BUFFER_MS,
    });
  },
});
