import { config } from "../config.js";
import { matchMember } from "../roster.js";
import { getAliases } from "../aliases.js";
import { ocrImage } from "./ocr.js";
import { geminiImage } from "./gemini.js";

/**
 * Hybrid extraction over a set of images.
 *
 * Per image:
 *   1. Tesseract OCR → candidate rows.
 *   2. A row is "accepted" when its name fuzzy-matches a roster IGN at
 *      ≥ ocrAcceptScore. (The roster is ground truth — OCR only has to get
 *      CLOSE, which is what makes cheap OCR viable at all.)
 *   3. If an image yields fewer than minRowsPerImage accepted rows, the
 *      whole image is re-read with Gemini vision and those rows win.
 *
 * Returns {
 *   results:  Map<rosterRow, { entry, points, source, score }>,
 *   unknowns: [{ name, points, source }]   — extracted but matched nobody
 *   conflicts:[{ ign, values }]            — same member, different points
 *   stats:    { images, ocrOnly, geminiFallback, geminiErrors }
 * }
 */
export async function extractBatch(images, roster, { onProgress } = {}) {
  const mode = config.extraction.mode;
  const aliases = getAliases(); // learned reading -> member, read fresh each run
  const results = new Map();
  const unknowns = [];
  const conflicts = new Map();
  const stats = { images: images.length, ocrOnly: 0, geminiFallback: 0, geminiErrors: 0, readErrors: 0 };

  let i = 0;
  for (const img of images) {
    i++;
    onProgress?.(`image ${i}/${images.length} (${img.name})…`);

    let rows = [];
    let source = "ocr";

    if (mode !== "gemini") {
      const ocr = await ocrImage(img.buffer);
      rows = ocr.rows;
    }

    let accepted = acceptRows(rows, roster, config.extraction.ocrAcceptScore, "ocr", aliases);

    const needFallback =
      mode === "gemini" ||
      (mode === "hybrid" && accepted.length < config.extraction.minRowsPerImage);

    if (needFallback) {
      try {
        const gRows = await geminiImage(img.buffer, img.contentType);
        // Gemini names are trusted verbatim; still map them onto the roster
        // with a looser threshold (0.6) so tiny render differences don't
        // orphan a row. Anything below that is reported as unknown.
        accepted = acceptRows(gRows, roster, 0.6, "gemini", aliases, unknowns);
        source = "gemini";
        stats.geminiFallback++;
      } catch (err) {
        stats.geminiErrors++;
        stats.readErrors++;
        // Full detail to the server console (for the operator); neutral,
        // method-agnostic wording on the visible progress surface.
        console.error(`Extraction error on ${img.name}:`, err.message);
        onProgress?.(`⚠️ couldn’t read ${img.name} — continuing`);
      }
    } else {
      stats.ocrOnly++;
    }

    for (const row of accepted) {
      const prev = results.get(row.entry.row);
      if (prev && prev.points !== row.points) {
        // Same member seen twice with different values (overlapping screenshots)
        const c = conflicts.get(row.entry.ign) ?? new Set([prev.points]);
        c.add(row.points);
        conflicts.set(row.entry.ign, c);
        // Higher-trust source wins; otherwise keep the first sighting
        if (sourceRank(row.source) > sourceRank(prev.source)) results.set(row.entry.row, row);
      } else if (!prev) {
        results.set(row.entry.row, row);
      }
    }
  }

  return {
    results,
    unknowns,
    conflicts: [...conflicts.entries()].map(([ign, values]) => ({ ign, values: [...values] })),
    stats,
  };
}

function sourceRank(s) {
  return s === "gemini" ? 2 : 1;
}

function acceptRows(rows, roster, threshold, source, aliases, unknownsSink) {
  const accepted = [];
  for (const raw of rows) {
    if (!Number.isFinite(raw.points)) continue;
    const { entry, score } = matchMember(roster, raw, aliases);
    if (entry && score >= threshold) {
      accepted.push({ entry, points: raw.points, source, score, extractedName: raw.name });
    } else if (unknownsSink) {
      unknownsSink.push({ name: raw.name, points: raw.points, source });
    }
  }
  return accepted;
}
