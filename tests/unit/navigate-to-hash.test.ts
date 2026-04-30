import { describe, it, expect, vi, beforeEach } from 'vitest';

const { executeInElectronSpy } = vi.hoisted(() => ({
  executeInElectronSpy: vi.fn(async () => 'mocked'),
}));

vi.mock('../../src/utils/electron-connection', () => ({
  executeInElectron: executeInElectronSpy,
}));

import { navigateToHash } from '../../src/commands/navigate/navigate-to-hash';

/**
 * Issue #17: react-router-dom v7 HashRouter listens on `popstate`, but
 * `pushState` does not fire `popstate` natively. We dispatch it manually so the
 * router's `useLocation()` updates after navigation. Also keep `hashchange` for
 * legacy listeners.
 */
describe('navigate_to_hash generated JS', () => {
  beforeEach(() => {
    executeInElectronSpy.mockClear();
  });

  it('dispatches both hashchange and popstate after pushState', async () => {
    await navigateToHash.execute({ hash: '/forms' }, {});

    expect(executeInElectronSpy).toHaveBeenCalledTimes(1);
    const generatedCode = executeInElectronSpy.mock.calls[0][0] as string;

    expect(generatedCode).toMatch(/window\.history\.pushState\(/);
    expect(generatedCode).toMatch(/new HashChangeEvent\('hashchange'/);
    expect(generatedCode).toMatch(/new PopStateEvent\('popstate'/);
  });

  it('rejects javascript: hash without invoking executeInElectron', async () => {
    const result = await navigateToHash.execute({ hash: 'javascript:alert(1)' }, {});

    expect(result).toBe('Invalid hash: contains dangerous content');
    expect(executeInElectronSpy).not.toHaveBeenCalled();
  });

  it('falls back to location.hash when pushState unavailable', async () => {
    await navigateToHash.execute({ hash: '/secondary' }, {});
    const generatedCode = executeInElectronSpy.mock.calls[0][0] as string;

    expect(generatedCode).toMatch(/window\.location\.hash =/);
  });
});
