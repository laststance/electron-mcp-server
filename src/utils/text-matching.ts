/**
 * Text matching scoring helpers for `electron_click_by_text`.
 *
 * Why a string-source export?
 * The scoring runs **inside the Electron renderer** (sent over CDP as a code
 * string and evaluated). To unit-test the same algorithm in vitest we'd need
 * either a parallel TS implementation (drift risk) or a way to load the JS
 * source into a sandbox. Exporting the helpers as a JS source string lets us:
 *   - Inline them into the IIFE that goes over CDP (see `generateClickByTextCommand`)
 *   - Load them into a `new Function(...)` sandbox in tests (see `tests/unit/text-matching.test.ts`)
 * Single source of truth, both sides exercise the exact same characters.
 *
 * Webpack ships in `mode: 'production'` with `minimize: false` (see
 * `webpack.config.ts`), so this template string is preserved verbatim.
 */
export const TEXT_MATCH_HELPERS_JS = `
function isWordChar(ch) {
  if (!ch) return false;
  var code = ch.charCodeAt(0);
  // ASCII alphanumeric: 0-9, A-Z, a-z. UI text matching does not need full
  // Unicode word semantics — the CJK-text use case goes through exact-match
  // (no word splitting), and Latin labels are well-served by ASCII bounds.
  return (code >= 48 && code <= 57)
      || (code >= 65 && code <= 90)
      || (code >= 97 && code <= 122);
}

function containsAsWord(haystack, needle) {
  if (!needle || !haystack) return false;
  var idx = haystack.indexOf(needle);
  while (idx !== -1) {
    var beforeChar = idx === 0 ? '' : haystack.charAt(idx - 1);
    var afterPos = idx + needle.length;
    var afterChar = afterPos >= haystack.length ? '' : haystack.charAt(afterPos);
    if (!isWordChar(beforeChar) && !isWordChar(afterChar)) return true;
    idx = haystack.indexOf(needle, idx + 1);
  }
  return false;
}

function tokenizeTarget(target) {
  // Split on space character only. Empty tokens dropped.
  var raw = target.split(' ');
  var out = [];
  for (var i = 0; i < raw.length; i++) {
    var token = raw[i];
    if (token && token.length > 0) out.push(token);
  }
  return out;
}

/**
 * Score how strongly target matches the given fields. Returns 0 when no
 * meaningful textual relation exists — this gates the candidate list and
 * is what fixes the "Heavy Math → Fetch Data" false-positive (#3): the
 * old positional similarity gave 4/10 = 0.4 → +8 from coincidental
 * character alignment plus visibility/interactivity bonuses, summing to 38.
 *
 * Score levels:
 *   100 — full string equality on any field
 *    70 — target appears as a contiguous phrase at word boundaries
 *    50 — every word in target appears at word boundaries (any order)
 *  10-19 — partial: ≥50% of target words present (only for multi-word targets)
 *     0 — no textual relation; element is filtered out
 *
 * Visibility/interactivity bonuses are applied by the caller on top of this.
 */
function scoreTextMatch(text, label, title, target) {
  var targetLower = (target || '').toLowerCase().trim();
  if (!targetLower) return 0;

  var fields = [];
  var rawFields = [text, label, title];
  for (var rfi = 0; rfi < rawFields.length; rfi++) {
    var raw = (rawFields[rfi] || '').toLowerCase().trim();
    if (raw.length > 0) fields.push(raw);
  }
  if (fields.length === 0) return 0;

  var targetWords = tokenizeTarget(targetLower);

  var best = 0;
  for (var fi = 0; fi < fields.length; fi++) {
    var field = fields[fi];
    var fieldScore = 0;
    if (field === targetLower) {
      fieldScore = 100;
    } else if (containsAsWord(field, targetLower)) {
      fieldScore = 70;
    } else if (targetWords.length >= 2) {
      var matched = 0;
      for (var wi = 0; wi < targetWords.length; wi++) {
        if (containsAsWord(field, targetWords[wi])) matched++;
      }
      if (matched === targetWords.length) {
        fieldScore = 50;
      } else if (matched > 0 && (matched / targetWords.length) >= 0.5) {
        // Partial multi-word match: low score, will only win if nothing
        // better exists and the accept threshold is satisfied.
        fieldScore = Math.round(20 * (matched / targetWords.length));
      }
    }
    if (fieldScore > best) best = fieldScore;
  }
  return best;
}
`;
