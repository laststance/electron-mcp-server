import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineCommand, type CommandModule } from '../../src/commands/types';

/**
 * Verifies the variance-fixing factory:
 * - `defineCommand` infers the schema's type at the construction site, so
 *   `args` inside `execute` is fully typed.
 * - The returned object widens to `CommandModule`, which lets the registry
 *   array hold heterogeneous schema shapes without TS variance errors.
 */

describe('defineCommand factory', () => {
  it('returns an object widened to CommandModule', () => {
    const schema = z.object({ value: z.string() });
    const command = defineCommand({
      name: 'electron_test_command',
      description: 'Test command for variance check.',
      schema,
      operationType: 'command',
      async execute(args) {
        return `Got: ${args.value}`;
      },
    });

    const stored: CommandModule = command;
    expect(stored.name).toBe('electron_test_command');
    expect(stored.operationType).toBe('command');
  });

  it('lets execute receive correctly-typed args inferred from the schema', async () => {
    const schema = z.object({ count: z.number().int(), label: z.string() });
    const command = defineCommand({
      name: 'electron_inferred',
      description: 'Confirms args inference at the construction site.',
      schema,
      operationType: 'query',
      async execute(args) {
        return `${args.label} x ${args.count}`;
      },
    });

    const fakeTarget = {
      id: 't',
      title: '',
      url: '',
      webSocketDebuggerUrl: '',
      type: 'page',
    };
    const result = await command.execute({ count: 3, label: 'hi' }, fakeTarget);
    expect(result).toBe('hi x 3');
  });

  it('runs the schema validation through the stored schema', () => {
    const command = defineCommand({
      name: 'electron_strict_schema',
      description: 'Schema enforcement test.',
      schema: z.object({ amount: z.number().positive() }),
      operationType: 'query',
      async execute() {
        return 'ok';
      },
    });

    expect(() => command.schema.parse({ amount: 5 })).not.toThrow();
    expect(() => command.schema.parse({ amount: -1 })).toThrow();
    expect(() => command.schema.parse({})).toThrow();
  });

  it('preserves operationType="eval" for the eval-class commands', () => {
    const command = defineCommand({
      name: 'electron_runs_eval',
      description: 'Eval-class command.',
      schema: z.object({ code: z.string().min(1) }),
      operationType: 'eval',
      async execute() {
        return 'evaluated';
      },
    });
    expect(command.operationType).toBe('eval');
  });
});
