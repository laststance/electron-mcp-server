import { z } from 'zod';
import { logger } from '../utils/logger';
import { SecurityLevel, SECURITY_PROFILES, getDefaultSecurityLevel } from './config';

// Input validation schemas
export const SecureCommandSchema = z.object({
  command: z.string().min(1).max(10000),
  args: z.any().optional(),
  sessionId: z.string().optional(),
  // Required so eval routing fails closed: callers MUST declare the operation
  // type explicitly. A missing field would otherwise route user-controlled JS
  // through validateCommandContent and skip validateEvalContent entirely.
  operationType: z.enum(['command', 'query', 'eval', 'screenshot', 'logs', 'window_info']),
});

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedInput?: any;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export class InputValidator {
  private static securityLevel: SecurityLevel = getDefaultSecurityLevel();

  static setSecurityLevel(level: SecurityLevel) {
    this.securityLevel = level;
    logger.info(`Security level changed to: ${level}`);
  }

  static getSecurityLevel(): SecurityLevel {
    return this.securityLevel;
  }

  private static readonly DANGEROUS_KEYWORDS = [
    'Function',
    'constructor',
    '__proto__',
    'prototype',
    'process',
    'require',
    'import',
    'fs',
    'child_process',
    'exec',
    'spawn',
    'fork',
    'cluster',
    'worker_threads',
    'vm',
    'repl',
    'readline',
    'crypto',
    'http',
    'https',
    'net',
    'dgram',
    'tls',
    'url',
    'querystring',
    'path',
    'os',
    'util',
    'events',
    'stream',
    'buffer',
    'timers',
    'setImmediate',
    'clearImmediate',
    'setTimeout',
    'clearTimeout',
    'setInterval',
    'clearInterval',
    'global',
    'globalThis',
  ];

  /**
   * Subset of identifiers that must never appear in any eval payload, regardless
   * of the security level or `safePatterns` allowlist. Compared to the broader
   * {@link DANGEROUS_KEYWORDS} (used for non-eval command content), this list
   * intentionally excludes Node.js module names that collide with legitimate
   * web platform identifiers (`url` ↔ `document.URL`, `crypto` ↔ `window.crypto`,
   * `path` ↔ pathname helpers, etc.) so we don't reject documented safe payloads
   * while still catching the prototype-pollution / process-escape primitives that
   * Issue #9 was about.
   */
  private static readonly EVAL_CRITICAL_KEYWORDS = [
    'Function',
    'constructor',
    '__proto__',
    'prototype',
    'process',
    'require',
    'import',
    'global',
    'globalThis',
    'child_process',
    'worker_threads',
    'vm',
    'repl',
  ];

  private static readonly XSS_PATTERNS = [
    /<script[^>]*>[\s\S]*?<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /<iframe[^>]*>/gi,
    /<object[^>]*>/gi,
    /<embed[^>]*>/gi,
    /<link[^>]*>/gi,
    /<meta[^>]*>/gi,
  ];

  private static readonly INJECTION_PATTERNS = [
    /['"];\s*(?:drop|delete|insert|update|select|union|exec|execute)\s+/gi,
    /\$\{[^}]*\}/g, // Template literal injection
    /`[^`]*`/g, // Backtick strings
    /eval\s*\(/gi,
    /new\s+Function\s*\(/gi, // Function constructor only, not function expressions
    /window\s*\[\s*['"]Function['"]\s*\]/gi, // Dynamic function access
  ];

  static validateCommand(input: unknown): ValidationResult {
    try {
      // Parse and validate structure
      const parsed = SecureCommandSchema.parse(input);

      const result: ValidationResult = {
        isValid: true,
        errors: [],
        sanitizedInput: parsed,
        riskLevel: 'low',
      };

      // Validate command content
      let commandValidation;
      if (parsed.operationType === 'eval') {
        // Special validation for eval — `parsed.command` is the JavaScript code
        // (handlers.ts passes the user-supplied code in the command field when
        // operationType is 'eval'). Avoid relying on the literal string 'eval'
        // matching the command name.
        commandValidation = this.validateEvalContent(parsed.command);
      } else {
        commandValidation = this.validateCommandContent(parsed.command);
      }
      result.errors.push(...commandValidation.errors);
      result.riskLevel = this.calculateRiskLevel(commandValidation.riskFactors);

      // Sanitize the command
      result.sanitizedInput.command = this.sanitizeCommand(parsed.command);

      result.isValid = result.errors.length === 0 && result.riskLevel !== 'critical';

      return result;
    } catch (error) {
      return {
        isValid: false,
        errors: [
          `Invalid input structure: ${error instanceof Error ? error.message : String(error)}`,
        ],
        riskLevel: 'high',
      };
    }
  }

  private static validateCommandContent(command: string): {
    errors: string[];
    riskFactors: string[];
  } {
    const errors: string[] = [];
    const riskFactors: string[] = [];

    // Check for dangerous keywords, but allow legitimate function expressions
    for (const keyword of this.DANGEROUS_KEYWORDS) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      if (regex.test(command)) {
        // Special handling for 'Function' keyword
        if (keyword === 'Function') {
          // Allow function expressions that start with ( like (function() {})()
          // Also allow function declarations like function name() {}
          // But block Function constructor calls
          const isFunctionExpression = /^\s*\(\s*function\s*\(/.test(command.trim());
          const isFunctionDeclaration = /^\s*function\s+\w+\s*\(/.test(command.trim());
          const isFunctionConstructor =
            /(?:new\s+Function\s*\(|(?:window\.|global\.)?Function\s*\()/gi.test(command);

          if (isFunctionConstructor && !isFunctionExpression && !isFunctionDeclaration) {
            errors.push(`Dangerous keyword detected: ${keyword}`);
            riskFactors.push(`dangerous_keyword_${keyword}`);
          }
          // Skip adding error for legitimate function expressions/declarations
        } else {
          errors.push(`Dangerous keyword detected: ${keyword}`);
          riskFactors.push(`dangerous_keyword_${keyword}`);
        }
      }
    }

    // Check for XSS patterns
    for (const pattern of this.XSS_PATTERNS) {
      if (pattern.test(command)) {
        errors.push(`Potential XSS pattern detected`);
        riskFactors.push('xss_pattern');
      }
    }

    // Check for injection patterns
    for (const pattern of this.INJECTION_PATTERNS) {
      if (pattern.test(command)) {
        errors.push(`Potential code injection detected`);
        riskFactors.push('injection_pattern');
      }
    }

    // Check command length
    if (command.length > 5000) {
      errors.push(`Command too long (${command.length} chars, max 5000)`);
      riskFactors.push('excessive_length');
    }

    // Check for obfuscation attempts
    const obfuscationScore = this.calculateObfuscationScore(command);
    if (obfuscationScore > 0.7) {
      errors.push(`Potential code obfuscation detected (score: ${obfuscationScore.toFixed(2)})`);
      riskFactors.push('obfuscation');
    }

    return { errors, riskFactors };
  }

  /**
   * Special validation for eval commands - validates the actual code to be executed.
   *
   * Defense-in-depth: {@link EVAL_CRITICAL_KEYWORDS} are screened on every eval
   * payload regardless of whether it matches a `safePatterns` shortcut, because
   * the generic property-access pattern (`/^[\w.[\]'"]+$/`) was previously letting
   * `process.platform`, `globalThis.foo`, `__proto__.constructor` etc. through
   * unchecked (Issue #9). The list is intentionally narrower than the broader
   * `DANGEROUS_KEYWORDS` used by `validateCommandContent`, so legitimate web
   * platform expressions like `document.URL` are not flagged. The function-call
   * / assignment / obfuscation checks are still gated by `isSafe`.
   */
  private static validateEvalContent(code: string): {
    errors: string[];
    riskFactors: string[];
  } {
    const errors: string[] = [];
    const riskFactors: string[] = [];
    const profile = SECURITY_PROFILES[this.securityLevel];

    // Defense-in-depth: scan only the eval-critical subset unconditionally so we
    // catch prototype-pollution / process-escape primitives (Issue #9) without
    // false-positiving identifiers shared with the web platform (Issue: PR #22
    // CodeRabbit feedback — `document.URL` was being rejected by `\burl\b`).
    for (const keyword of this.EVAL_CRITICAL_KEYWORDS) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'g');
      if (regex.test(code)) {
        errors.push(`Dangerous keyword detected in eval: ${keyword}`);
        riskFactors.push(`eval_dangerous_keyword_${keyword}`);
      }
    }

    // Allow simple safe operations
    const safePatterns = [
      /^document\.(title|location|URL|domain)$/,
      /^window\.(location|navigator|screen)$/,
      /^Math\.\w+$/,
      /^Date\.\w+$/,
      /^JSON\.(parse|stringify)$/,
      /^[\w.[\]'"]+$/, // Simple property access
    ];

    // Allow DOM queries based on security level
    const domQueryPatterns = profile.allowDOMQueries
      ? [
          /^document\.querySelector\([^)]+\)$/, // Simple querySelector without function calls
          /^document\.querySelectorAll\([^)]+\)$/, // Simple querySelectorAll
          /^document\.getElementById\([^)]+\)$/, // getElementById
          /^document\.getElementsByClassName\([^)]+\)$/, // getElementsByClassName
          /^document\.getElementsByTagName\([^)]+\)$/, // getElementsByTagName
          /^document\.activeElement$/, // Check active element
        ]
      : [];

    // Allow UI interactions based on security level
    const uiInteractionPatterns = profile.allowUIInteractions
      ? [
          /^window\.getComputedStyle\([^)]+\)$/, // Get computed styles
          /^[\w.]+\.(textContent|innerText|innerHTML|value|checked|selected|disabled|hidden)$/, // Property access
          /^[\w.]+\.(clientWidth|clientHeight|offsetWidth|offsetHeight|getBoundingClientRect)$/, // Size/position
          /^[\w.]+\.(focus|blur|scrollIntoView)\(\)$/, // UI methods
        ]
      : [];

    // Check if it's a safe pattern
    const isSafe =
      safePatterns.some((pattern) => pattern.test(code.trim())) ||
      domQueryPatterns.some((pattern) => pattern.test(code.trim())) ||
      uiInteractionPatterns.some((pattern) => pattern.test(code.trim()));

    if (!isSafe) {
      // Check for function calls based on security profile
      const hasFunctionCall = /\(\s*\)|\w+\s*\(/.test(code);
      if (hasFunctionCall) {
        // Extract function name
        const functionMatch = code.match(/(\w+)\s*\(/);
        const functionName = functionMatch ? functionMatch[1] : '';

        // Check if function is allowed
        const isAllowedFunction =
          profile.allowFunctionCalls.includes('*') ||
          profile.allowFunctionCalls.some(
            (allowed) => functionName.includes(allowed) || code.includes(allowed + '('),
          );

        if (!isAllowedFunction) {
          errors.push(`Function calls in eval are restricted (${functionName})`);
          riskFactors.push('eval_function_call');
        }
      }

      // Detect any assignment operator while excluding the comparison and arrow
      // forms (`==`, `===`, `!=`, `!==`, `<=`, `>=`, `=>`).
      //
      // The standalone `=` branch uses a negative lookbehind (rejects `=` after
      // `[=!<>]`) plus a negative lookahead (rejects `=` before `[=>]`).
      // Issue #21: the previous `/=(?!=)/` flagged `===`/`!==`/arrow funcs as
      // assignments.
      //
      // Compound assignment operators must be matched explicitly, because the
      // lookbehind only inspects the single character before `=` — for `<<=`
      // the `=` is preceded by `<`, which sits in the lookbehind exclusion set
      // and would otherwise let `a <<= 1` bypass `allowAssignments` (PR #22
      // CodeRabbit round 2). Longest alternatives are listed first so the
      // engine prefers e.g. `>>>=` over the `>>=` substring.
      const assignmentPattern =
        /<<=|>>>=|>>=|\*\*=|&&=|\|\|=|\?\?=|[+\-*/%&|^]=|(?<![=!<>])=(?![=>])/;
      if (assignmentPattern.test(code) && !profile.allowAssignments) {
        errors.push(`Assignment operations in eval are restricted`);
        riskFactors.push('eval_assignment');
      }
    }

    return { errors, riskFactors };
  }

  private static calculateObfuscationScore(code: string): number {
    let score = 0;
    const length = code.length;

    if (length === 0) return 0;

    // Check for excessive special characters
    const specialChars = (code.match(/[^a-zA-Z0-9\s]/g) || []).length;
    const specialCharRatio = specialChars / length;
    if (specialCharRatio > 0.3) score += 0.3;

    // Check for excessive parentheses/brackets
    const brackets = (code.match(/[(){}[\]]/g) || []).length;
    const bracketRatio = brackets / length;
    if (bracketRatio > 0.2) score += 0.2;

    // Check for encoded content
    if (/\\x[0-9a-fA-F]{2}/.test(code)) score += 0.2;
    if (/\\u[0-9a-fA-F]{4}/.test(code)) score += 0.2;
    if (/\\[0-7]{3}/.test(code)) score += 0.1;

    // Check for string concatenation patterns
    const concatPatterns = (code.match(/\+\s*["'`]/g) || []).length;
    if (concatPatterns > 5) score += 0.2;

    return Math.min(score, 1.0);
  }

  private static calculateRiskLevel(riskFactors: string[]): 'low' | 'medium' | 'high' | 'critical' {
    const criticalFactors = riskFactors.filter(
      (f) => f.includes('dangerous_keyword') || f.includes('injection_pattern'),
    );

    const highFactors = riskFactors.filter(
      (f) => f.includes('xss_pattern') || f.includes('obfuscation'),
    );

    if (criticalFactors.length > 0) return 'critical';
    if (highFactors.length > 0 || riskFactors.length > 3) return 'high';
    if (riskFactors.length > 1) return 'medium';
    return 'low';
  }

  private static sanitizeCommand(command: string): string {
    // Remove dangerous patterns
    let sanitized = command;

    // Remove HTML/script tags
    sanitized = sanitized.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    sanitized = sanitized.replace(/<[^>]*>/g, '');

    // Remove javascript: URLs
    sanitized = sanitized.replace(/javascript:/gi, '');

    // For code execution, don't HTML-escape quotes as it breaks JavaScript syntax
    // Just remove dangerous URL schemes and HTML tags

    return sanitized;
  }
}
