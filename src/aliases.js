import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeName } from "./roster.js";

// Learned name aliases: a normalized "reading" the screenshots produce ->
// the member it really is. Populated when an officer approves a double-checked
// name, so the same misread auto-matches at 100% every week after.
//
// Keyed by UID (stable across IGN changes). Stored as plain JSON next to the
// bot so it survives restarts. { [normalizedReading]: { uid, ign, addedAt } }
const FILE = fileURLToPath(new URL("../aliases.json", import.meta.url));

let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {};
  } catch {
    cache = {};
  }
  return cache;
}

function persist() {
  try {
    writeFileSync(FILE, JSON.stringify(cache, null, 2));
  } catch (err) {
    console.error("Couldn't save aliases.json:", err.message);
  }
}

/** The whole map (normalizedReading -> {uid, ign}). Read fresh each run. */
export function getAliases() {
  return { ...load() };
}

/** uid for a raw reading, or null. */
export function aliasUid(reading) {
  const hit = load()[normalizeName(reading)];
  return hit ? hit.uid : null;
}

/** Remember reading -> member (called on approve). */
export function setAlias(reading, uid, ign) {
  const key = normalizeName(reading);
  if (!key || !uid) return;
  load()[key] = { uid: String(uid), ign, addedAt: new Date().toISOString() };
  persist();
}

/** Forget a reading (called on deny, in case it was learned wrong before). */
export function removeAlias(reading) {
  const key = normalizeName(reading);
  if (load()[key]) {
    delete cache[key];
    persist();
  }
}
