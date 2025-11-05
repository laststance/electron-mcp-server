import { logger } from '../../src/utils/logger';
import { TestHelpers } from './helpers';
import { TEST_CONFIG } from './config';
import { mkdirSync, existsSync } from 'fs';

/**
 * Global test setup and teardown
 * Handles initialization and cleanup that applies to all tests
 */
export class GlobalTestSetup {
  /**
   * Initialize global test environment
   * Called once before all tests run
   */
  static async initialize(): Promise<void> {
    logger.info('🚀 Starting test suite - Global setup');

    try {
      // Ensure test directories exist
      this.ensureTestDirectories();

      // Clean up any leftover artifacts from previous runs
      await TestHelpers.cleanup();

      logger.info('📁 Test resource directories initialized');
    } catch (error) {
      logger.error('Failed to initialize test environment:', error);
      throw error;
    }
  }

  /**
   * Clean up global test environment
   * Called once after all tests complete
   */
  static async cleanup(): Promise<void> {
    logger.info('🏁 Test suite completed - Global cleanup');

    try {
      const { total } = TestHelpers.getCleanupSize();
      const totalMB = (total / (1024 * 1024)).toFixed(2);

      logger.info(`🧹 Cleaning up ${totalMB}MB of test artifacts`);

      // Perform comprehensive cleanup
      await TestHelpers.cleanup({
        removeLogsDir: true,
        removeTempDir: true,
        preserveKeys: false,
      });

      logger.info('✅ Global test cleanup completed successfully');
    } catch (error) {
      logger.error('Failed to cleanup test environment:', error);
      // Don't throw - cleanup failures shouldn't break the test process
    }
  }

  /**
   * Ensure all required test directories exist
   */
  private static ensureTestDirectories(): void {
    Object.values(TEST_CONFIG.PATHS).forEach((dirPath) => {
      if (!existsSync(dirPath)) {
        mkdirSync(dirPath, { recursive: true });
      }
    });
  }
}
