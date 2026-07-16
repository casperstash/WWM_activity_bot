import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The grading scale — the point cutoffs and tier names that decide who's a
// Lurker / Developing / Pillar. Editable at runtime with /grade, persisted next
// to the bot so it survives restarts.
const FILE = fileURLToPath(new URL("../grading.json", import.meta.url));

const DEFAULTS = {
  lurkerUnder: 1000, // points below this  -> tier 1 (red)
  developingUnder: 2500, // points below this  -> tier 2 (yellow); at/above -> tier 3
  names: { lurker: "Lurker", developing: "Developing", pillar: "Pillar" },
};

let cache = null;

function load() {
  if (cache) return cache;
  try {
    const saved = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {};
    cache = { ...DEFAULTS, ...saved, names: { ...DEFAULTS.names, ...(saved.names || {}) } };
  } catch {
    cache = { ...DEFAULTS, names: { ...DEFAULTS.names } };
  }
  return cache;
}

export function getGrading() {
  const g = load();
  return { ...g, names: { ...g.names } };
}

/**
 * Apply a partial update. Accepts { lurkerUnder, developingUnder, names:{...} }.
 * Validates that the cutoffs stay ordered and positive; throws a friendly
 * Error otherwise (the command surfaces the message).
 */
export function setGrading(patch = {}) {
  const g = load();
  const next = {
    lurkerUnder: patch.lurkerUnder ?? g.lurkerUnder,
    developingUnder: patch.developingUnder ?? g.developingUnder,
    names: { ...g.names, ...(patch.names || {}) },
  };
  if (!Number.isInteger(next.lurkerUnder) || next.lurkerUnder < 1) {
    throw new Error("The lower cutoff must be a whole number of 1 or more.");
  }
  if (!Number.isInteger(next.developingUnder) || next.developingUnder <= next.lurkerUnder) {
    throw new Error(`The upper cutoff must be a whole number greater than ${next.lurkerUnder}.`);
  }
  cache = next;
  try {
    writeFileSync(FILE, JSON.stringify(next, null, 2));
  } catch (err) {
    console.error("Couldn't save grading.json:", err.message);
  }
  return getGrading();
}
