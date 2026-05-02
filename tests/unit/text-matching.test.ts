import { describe, it, expect } from 'vitest';
import { CLICK_BY_TEXT_MIN_TEXT_SCORE } from '../../src/constants';
import { TEXT_MATCH_HELPERS_JS } from '../../src/utils/text-matching';

/**
 * Load the text-matching helpers from the JS source string into a sandbox so
 * we exercise the *exact same characters* that get sent to the Electron
 * renderer over CDP. Avoids drift between the tested algorithm and the one
 * that runs in production.
 */
type Helpers = {
  scoreTextMatch: (text: string, label: string, title: string, target: string) => number;
  containsAsWord: (haystack: string, needle: string) => boolean;
};

function loadHelpers(): Helpers {
  const exports: Record<string, unknown> = {};
  // eslint-disable-next-line no-new-func -- intentional: we want to evaluate the
  // source string the renderer will actually run, in a controlled vitest sandbox.
  new Function(
    'exports',
    `${TEXT_MATCH_HELPERS_JS}
    exports.scoreTextMatch = scoreTextMatch;
    exports.containsAsWord = containsAsWord;`,
  )(exports);
  return exports as unknown as Helpers;
}

const { scoreTextMatch, containsAsWord } = loadHelpers();

describe('containsAsWord', () => {
  it('matches whole word at start', () => {
    expect(containsAsWord('fetch data', 'fetch')).toBe(true);
  });

  it('matches whole word at end', () => {
    expect(containsAsWord('fetch data', 'data')).toBe(true);
  });

  it('matches whole word in middle', () => {
    expect(containsAsWord('click the submit button', 'submit')).toBe(true);
  });

  it('rejects substring inside larger word', () => {
    expect(containsAsWord('submitting', 'submit')).toBe(false);
    expect(containsAsWord('database', 'data')).toBe(false);
  });

  it('returns false on empty inputs', () => {
    expect(containsAsWord('', 'fetch')).toBe(false);
    expect(containsAsWord('fetch data', '')).toBe(false);
  });

  it('treats hyphens and punctuation as boundaries', () => {
    expect(containsAsWord('save-as', 'save')).toBe(true);
    expect(containsAsWord('save:as', 'as')).toBe(true);
  });
});

describe('scoreTextMatch — Issue #3 regression', () => {
  it('returns 0 for unrelated short strings (Heavy Math ↔ Fetch Data)', () => {
    // The original bug: positional char similarity gave 4/10 → +8 score, plus
    // visibility/interactivity bonuses summed to 38 → false-positive misclick.
    // Fix verifies textScore is 0, so candidate is filtered out entirely.
    expect(scoreTextMatch('Fetch Data', '', '', 'Heavy Math')).toBe(0);
  });

  it('rejects below CLICK_BY_TEXT_MIN_TEXT_SCORE threshold', () => {
    // Sanity: the threshold the renderer-side IIFE uses really does reject
    // the original false-positive.
    const score = scoreTextMatch('Fetch Data', '', '', 'Heavy Math');
    expect(score).toBeLessThan(CLICK_BY_TEXT_MIN_TEXT_SCORE);
  });

  it('returns 0 when target shares only individual chars with field', () => {
    // Catches the broken positional algorithm from another angle.
    expect(scoreTextMatch('Cancel', '', '', 'Submit')).toBe(0);
  });
});

describe('scoreTextMatch — exact and phrase matches', () => {
  it('returns 100 on exact match in text', () => {
    expect(scoreTextMatch('Submit', '', '', 'Submit')).toBe(100);
  });

  it('returns 100 on exact match in aria-label', () => {
    expect(scoreTextMatch('', 'Close dialog', '', 'Close dialog')).toBe(100);
  });

  it('returns 70 when target appears as contiguous phrase at word boundaries', () => {
    expect(scoreTextMatch('Click the Submit button', '', '', 'Submit button')).toBe(70);
  });

  it('returns 70 even if surrounded by punctuation', () => {
    expect(scoreTextMatch('[Save File]', '', '', 'Save File')).toBe(70);
  });

  it('is case-insensitive', () => {
    expect(scoreTextMatch('SUBMIT', '', '', 'submit')).toBe(100);
    expect(scoreTextMatch('Submit', '', '', 'SUBMIT')).toBe(100);
  });
});

describe('scoreTextMatch — multi-word matches', () => {
  it('returns 50 when all target words present at word boundaries (any order)', () => {
    // "Heavy Math" target, "Math Heavy" text → all words present, different order
    expect(scoreTextMatch('Math Heavy', '', '', 'Heavy Math')).toBe(50);
  });

  it('returns ≥ MIN threshold when all target words match', () => {
    const score = scoreTextMatch('Math Heavy', '', '', 'Heavy Math');
    expect(score).toBeGreaterThanOrEqual(CLICK_BY_TEXT_MIN_TEXT_SCORE);
  });

  it('returns partial score (< MIN) for half-word match on multi-word target', () => {
    // Only 'Math' present → 1/2 words. This is ambiguous, must NOT auto-accept.
    const score = scoreTextMatch('Math Solver', '', '', 'Heavy Math');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(CLICK_BY_TEXT_MIN_TEXT_SCORE);
  });

  it('returns 0 for partial single-word target (no fuzzy fallback)', () => {
    // Single-word target can't be "partial" — either matches the word or not.
    // (No more positional fuzzy matching that would incorrectly score this.)
    expect(scoreTextMatch('Submitting', '', '', 'Submit')).toBe(0);
  });
});

describe('scoreTextMatch — field selection', () => {
  it('takes the strongest signal across text/label/title', () => {
    // text doesn't match but aria-label does
    expect(scoreTextMatch('Icon', 'Save File', '', 'Save File')).toBe(100);
  });

  it('does not double-count across fields (max, not sum)', () => {
    // Three exact matches still scores 100, not 300.
    expect(scoreTextMatch('Submit', 'Submit', 'Submit', 'Submit')).toBe(100);
  });

  it('handles empty target safely', () => {
    expect(scoreTextMatch('any text', '', '', '')).toBe(0);
  });

  it('handles empty fields safely', () => {
    expect(scoreTextMatch('', '', '', 'Submit')).toBe(0);
  });
});
