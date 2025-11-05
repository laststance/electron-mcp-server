import { describe, it, expect, beforeEach } from 'vitest';
import { SecurityManager } from '../../src/security/manager';
import { SecurityLevel } from '../../src/security/config';
import { TEST_CONFIG } from '../conftest';

describe('SecurityManager Unit Tests', () => {
  describe('shouldSandboxCommand', () => {
    let securityManager: SecurityManager;

    beforeEach(() => {
      securityManager = new SecurityManager();
    });

    it('should sandbox risky commands', () => {
      TEST_CONFIG.SECURITY.RISKY_COMMANDS.forEach((command) => {
        const result = securityManager.shouldSandboxCommand(command);
        expect(result).toBe(true);
      });
    });

    it('should not sandbox simple command names', () => {
      const simpleCommands = ['get_window_info', 'take_screenshot', 'get_title', 'get_url'];

      simpleCommands.forEach((command) => {
        const result = securityManager.shouldSandboxCommand(command);
        expect(result).toBe(false);
      });
    });

    it('should cache results for performance', () => {
      const command = 'test_command';

      // First call
      const result1 = securityManager.shouldSandboxCommand(command);

      // Second call should use cache
      const result2 = securityManager.shouldSandboxCommand(command);

      expect(result1).toBe(result2);
    });
  });

  describe('Security Level Configuration', () => {
    it('should default to BALANCED security level', () => {
      const securityManager = new SecurityManager();
      expect(securityManager.getSecurityLevel()).toBe(SecurityLevel.BALANCED);
    });

    it('should allow security level changes', () => {
      const securityManager = new SecurityManager();

      securityManager.setSecurityLevel(SecurityLevel.PERMISSIVE);
      expect(securityManager.getSecurityLevel()).toBe(SecurityLevel.PERMISSIVE);

      securityManager.setSecurityLevel(SecurityLevel.STRICT);
      expect(securityManager.getSecurityLevel()).toBe(SecurityLevel.STRICT);
    });
  });
});
