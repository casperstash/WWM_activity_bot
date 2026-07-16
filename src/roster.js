import { distance } from "fastest-levenshtein";

/**
 * Normalize a member name for matching: NFKC-fold, lowercase, and strip
 * everything that isn't a letter or digit (any script). This makes
 * "• Gluttony •" ≡ "gluttony", "Šiłvęr" stays distinct from "Silver"
 * only by its diacritics — so we ALSO produce a diacritic-folded variant
 * and match on the best of both.
 */
export function normalizeName(raw) {
  if (!raw) return "";
  const nfkc = raw.normalize("NFKC").toLowerCase();
  return [...nfkc].filter((ch) => /[\p{L}\p{N}]/u.test(ch)).join("");
}

function foldDiacritics(s) {
  return s.normalize("NFKD").replace(/\p{M}/gu, "");
}

function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const d = distance(a, b);
  return 1 - d / Math.max(a.length, b.length);
}

// A match at or above this score is treated as confident; below it the value
// is still written (to the best-matching member) but flagged for a human to
// verify, since the extracted name didn't line up cleanly with the roster.
export const REVIEW_BELOW = 0.9;

/** Human-readable match confidence, e.g. 100, 80. */
export function confidencePct(score) {
  return Math.round(score * 100);
}

/** Should this match be surfaced for human review? */
export function needsReview(score) {
  return score < REVIEW_BELOW;
}

/**
 * Roster = the ground truth read from the sheet.
 * entries: [{ row, uid, ign, discord, status, key, keyFolded }]
 *   row is the 1-based sheet row number.
 */
export function buildRoster(rows) {
  const entries = [];
  for (const r of rows) {
    if (!r.ign) continue;
    const key = normalizeName(r.ign);
    entries.push({ ...r, key, keyFolded: foldDiacritics(key) });
  }
  return entries;
}

/**
 * Find the best roster match for an extracted name.
 * Returns { entry, score } — score 1 means exact (post-normalization).
 * UID match (when the screenshot shows UIDs) short-circuits at score 1.
 *
 * `aliases` is the learned reading->{uid} map (see aliases.js). A learned
 * reading resolves to its member at score 1, so approved names never need
 * re-checking in later weeks.
 */
export function matchMember(roster, { name, uid }, aliases = null) {
  if (uid) {
    const byUid = roster.find((e) => e.uid && String(e.uid) === String(uid).trim());
    if (byUid) return { entry: byUid, score: 1 };
  }
  const key = normalizeName(name);
  if (aliases && aliases[key]) {
    const byUid = roster.find((e) => e.uid && String(e.uid) === String(aliases[key].uid));
    if (byUid) return { entry: byUid, score: 1, viaAlias: true };
  }
  const keyFolded = foldDiacritics(key);
  let best = { entry: null, score: 0 };
  for (const e of roster) {
    let s = Math.max(similarity(key, e.key), similarity(keyFolded, e.keyFolded));
    // OCR often appends UI chrome to the name ("aeternaemembers95offline1d").
    // If a roster name (≥4 chars, to avoid short-name false hits) is the leading
    // part of the extracted string, treat it as a strong match.
    if (e.key.length >= 4 && (key.startsWith(e.key) || keyFolded.startsWith(e.keyFolded))) {
      s = Math.max(s, 0.9);
    }
    // Prefer the more specific (longer) roster name on ties.
    if (s > best.score || (s === best.score && best.entry && e.key.length > best.entry.key.length)) {
      best = { entry: e, score: s };
    }
  }
  return best;
}
