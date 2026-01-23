import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron-discovery for findElectronTarget tests
vi.mock('../../src/utils/electron-discovery', () => ({
  scanForElectronApps: vi.fn(),
  findMainTarget: vi.fn(),
  listElectronWindows: vi.fn(),
}));

import { findElectronTarget } from '../../src/utils/electron-connection';
import {
  scanForElectronApps,
  findMainTarget,
  listElectronWindows,
} from '../../src/utils/electron-discovery';

const mockedScanForElectronApps = vi.mocked(scanForElectronApps);
const mockedFindMainTarget = vi.mocked(findMainTarget);
const mockedListElectronWindows = vi.mocked(listElectronWindows);

/** Multi-app fixture with varied targets across ports */
const multiWindowFixture = [
  {
    port: 9222,
    targets: [
      {
        id: 'target-main-1',
        title: 'My Electron App',
        url: 'file:///app/index.html',
        type: 'page',
        webSocketDebuggerUrl: 'ws://localhost:9222/devtools/page/target-main-1',
      },
      {
        id: 'target-settings',
        title: 'Settings Window',
        url: 'file:///app/settings.html',
        type: 'page',
        webSocketDebuggerUrl: 'ws://localhost:9222/devtools/page/target-settings',
      },
      {
        id: 'target-devtools',
        title: 'DevTools',
        url: 'devtools://devtools/bundled/inspector.html',
        type: 'page',
        webSocketDebuggerUrl: 'ws://localhost:9222/devtools/page/target-devtools',
      },
    ],
  },
  {
    port: 9223,
    targets: [
      {
        id: 'target-second-app',
        title: 'Another App - Dashboard',
        url: 'file:///other/index.html',
        type: 'page',
        webSocketDebuggerUrl: 'ws://localhost:9223/devtools/page/target-second-app',
      },
    ],
  },
];

describe('Multi-Window Support', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findElectronTarget()', () => {
    it('should return first main target when no options provided (backward compatible)', async () => {
      mockedScanForElectronApps.mockResolvedValue(multiWindowFixture);
      mockedFindMainTarget.mockReturnValue(multiWindowFixture[0].targets[0]);

      const result = await findElectronTarget();

      expect(result.id).toBe('target-main-1');
      expect(result.title).toBe('My Electron App');
      expect(mockedFindMainTarget).toHaveBeenCalledWith(multiWindowFixture[0].targets);
    });

    it('should find target by exact targetId match', async () => {
      mockedScanForElectronApps.mockResolvedValue(multiWindowFixture);

      const result = await findElectronTarget({ targetId: 'target-settings' });

      expect(result.id).toBe('target-settings');
      expect(result.title).toBe('Settings Window');
      expect(result.webSocketDebuggerUrl).toBe(
        'ws://localhost:9222/devtools/page/target-settings',
      );
    });

    it('should find target by targetId across multiple apps', async () => {
      mockedScanForElectronApps.mockResolvedValue(multiWindowFixture);

      const result = await findElectronTarget({ targetId: 'target-second-app' });

      expect(result.id).toBe('target-second-app');
      expect(result.title).toBe('Another App - Dashboard');
    });

    it('should throw descriptive error when targetId not found', async () => {
      mockedScanForElectronApps.mockResolvedValue(multiWindowFixture);

      await expect(findElectronTarget({ targetId: 'nonexistent' })).rejects.toThrow(
        'No window found with targetId "nonexistent". Use list_electron_windows to see available targets.',
      );
    });

    it('should find target by windowTitle (case-insensitive partial match)', async () => {
      mockedScanForElectronApps.mockResolvedValue(multiWindowFixture);

      const result = await findElectronTarget({ windowTitle: 'settings' });

      expect(result.id).toBe('target-settings');
      expect(result.title).toBe('Settings Window');
    });

    it('should find target by windowTitle with mixed case', async () => {
      mockedScanForElectronApps.mockResolvedValue(multiWindowFixture);

      const result = await findElectronTarget({ windowTitle: 'DASHBOARD' });

      expect(result.id).toBe('target-second-app');
      expect(result.title).toBe('Another App - Dashboard');
    });

    it('should throw descriptive error when windowTitle not found', async () => {
      mockedScanForElectronApps.mockResolvedValue(multiWindowFixture);

      await expect(findElectronTarget({ windowTitle: 'nonexistent' })).rejects.toThrow(
        'No window found with title matching "nonexistent". Use list_electron_windows to see available targets.',
      );
    });

    it('should throw when no Electron apps found', async () => {
      mockedScanForElectronApps.mockResolvedValue([]);

      await expect(findElectronTarget()).rejects.toThrow(
        'No running Electron application found with remote debugging enabled',
      );
    });

    it('should prioritize targetId over windowTitle when both provided', async () => {
      mockedScanForElectronApps.mockResolvedValue(multiWindowFixture);

      // targetId is checked first in the implementation
      const result = await findElectronTarget({
        targetId: 'target-settings',
        windowTitle: 'Dashboard',
      });

      expect(result.id).toBe('target-settings');
    });
  });

  describe('listElectronWindows()', () => {
    it('should return all non-DevTools windows by default', async () => {
      mockedListElectronWindows.mockResolvedValue([
        { id: 'target-main-1', title: 'My Electron App', url: 'file:///app/index.html', port: 9222, type: 'page' },
        { id: 'target-settings', title: 'Settings Window', url: 'file:///app/settings.html', port: 9222, type: 'page' },
        { id: 'target-second-app', title: 'Another App - Dashboard', url: 'file:///other/index.html', port: 9223, type: 'page' },
      ]);

      const result = await listElectronWindows();

      expect(result).toHaveLength(3);
      expect(result.map((w) => w.id)).toEqual([
        'target-main-1',
        'target-settings',
        'target-second-app',
      ]);
    });

    it('should include DevTools windows when includeDevTools is true', async () => {
      mockedListElectronWindows.mockResolvedValue([
        { id: 'target-main-1', title: 'My Electron App', url: 'file:///app/index.html', port: 9222, type: 'page' },
        { id: 'target-settings', title: 'Settings Window', url: 'file:///app/settings.html', port: 9222, type: 'page' },
        { id: 'target-devtools', title: 'DevTools', url: 'devtools://devtools/bundled/inspector.html', port: 9222, type: 'page' },
        { id: 'target-second-app', title: 'Another App - Dashboard', url: 'file:///other/index.html', port: 9223, type: 'page' },
      ]);

      const result = await listElectronWindows(true);

      expect(result).toHaveLength(4);
      expect(result.find((w) => w.id === 'target-devtools')).toBeDefined();
    });

    it('should include port information for each window', async () => {
      mockedListElectronWindows.mockResolvedValue([
        { id: 'target-settings', title: 'Settings Window', url: 'file:///app/settings.html', port: 9222, type: 'page' },
        { id: 'target-second-app', title: 'Another App - Dashboard', url: 'file:///other/index.html', port: 9223, type: 'page' },
      ]);

      const result = await listElectronWindows();

      const settingsWindow = result.find((w) => w.id === 'target-settings');
      expect(settingsWindow?.port).toBe(9222);

      const secondApp = result.find((w) => w.id === 'target-second-app');
      expect(secondApp?.port).toBe(9223);
    });

    it('should return empty array when no apps found', async () => {
      mockedListElectronWindows.mockResolvedValue([]);

      const result = await listElectronWindows();

      expect(result).toEqual([]);
    });

    it('should handle targets with missing title/url gracefully', async () => {
      mockedListElectronWindows.mockResolvedValue([
        { id: 'minimal', title: '', url: '', port: 9222, type: 'page' },
      ]);

      const result = await listElectronWindows();

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('');
      expect(result[0].url).toBe('');
    });
  });
});

