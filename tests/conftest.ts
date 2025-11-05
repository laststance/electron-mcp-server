/**
 * Global test configuration - similar to Python's conftest.py
 * This file contains global test setup, fixtures, and configuration
 * that applies to all test files in the project.
 */

import { beforeAll, afterAll } from 'vitest';
import { GlobalTestSetup } from './support/setup';

// Global test setup that runs once before all tests
beforeAll(async () => {
  await GlobalTestSetup.initialize();
});

// Global test cleanup that runs once after all tests
afterAll(async () => {
  await GlobalTestSetup.cleanup();
});

// Export commonly used test utilities for easy importing
export { TestHelpers } from './support/helpers';
export { TEST_CONFIG } from './support/config';
export type { TestElectronApp } from './support/helpers';
