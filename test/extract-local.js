/**
 * Local extraction harness — test the OCR→Gemini pipeline on sample
 * screenshots WITHOUT Discord or Google Sheets credentials.
 *
 *   npm run extract -- path/to/img1.png path/to/img2.png
 *   npm run extract            (scans ../ for images — the "Serene Coding" folder)
 *
 * Roster ground truth comes from the exported CSV in the parent folder
 * (override with --csv <path>). Set EXTRACTION_MODE=ocr in .env to test
 * without a Gemini key.
 */
import { readFile, readdir } from "node:fs/promises";
import { resolve, extname, basename, join } from "node:path";
import { buildRoster, confidencePct, needsReview } from "../src/roster.js";
import { extractBatch } from "../src/extract/pipeline.js";
import { shutdownOcr } from "../src/extract/ocr.js";
import { activityFlag } from "../src/flag.js";

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

// ---- args ----
const args = process.argv.slice(2);
let csvPath = null;
const imagePaths = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--csv") csvPath = args[++i];
  else imagePaths.push(args[i]);
}

// Default image source: any images sitting in the parent folder
if (!imagePaths.length) {
  const parent = resolve(process.cwd(), "..");
  for (const f of await readdir(parent)) {
    if (IMAGE_EXTS.has(extname(f).toLowerCase())) imagePaths.push(join(parent, f));
  }
  if (!imagePaths.length) {
    console.error("No images given and none found in the parent folder.");
    process.exit(1);
  }
}

// Default roster source: the exported CSV in the parent folder
if (!csvPath) {
  const parent = resolve(process.cwd(), "..");
  const candidates = (await readdir(parent)).filter((f) => f.toLowerCase().endsWith(".csv"));
  const rosterCsv = candidates.find((f) => /activity/i.test(f)) ?? candidates[0];
  if (!rosterCsv) {
    console.error("No roster CSV found — pass --csv <path>.");
    process.exit(1);
  }
  csvPath = join(parent, rosterCsv);
}

// ---- minimal CSV parse (quoted fields ok) → roster rows ----
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

console.log(`Roster: ${basename(csvPath)}`);
const csv = parseCsv(await readFile(csvPath, "utf8"));
const members = [];
for (let i = 1; i < csv.length; i++) {
  const [uid = "", ign = "", discord = "", status = ""] = csv[i];
  if (!ign.trim()) continue;
  members.push({ row: i + 1, uid: uid.trim(), ign: ign.trim(), discord, status });
}
const roster = buildRoster(members);
console.log(`  ${roster.length} members loaded\n`);

// ---- load images ----
const images = [];
for (const p of imagePaths) {
  images.push({
    name: basename(p),
    buffer: await readFile(p),
    contentType: MIME[extname(p).toLowerCase()] ?? "image/png",
  });
}
console.log(`Images: ${images.map((x) => x.name).join(", ")}\n`);

// ---- run ----
const batch = await extractBatch(images, roster, { onProgress: (m) => console.log("  " + m) });
await shutdownOcr();

const { results, unknowns, conflicts, stats } = batch;
console.log("\n================ RESULTS ================");
console.log(`Matched ${results.size}/${roster.length} members`);
// Diagnostic line — local only, for the operator. (Not shown on the Discord report.)
console.log(`Images: ${stats.images} — OCR-only: ${stats.ocrOnly}, vision: ${stats.geminiFallback}, read errors: ${stats.readErrors}\n`);

const FLAG_ICON = { red: "🔴", yellow: "🟡" };
const sorted = [...results.values()].sort((a, b) => a.entry.row - b.entry.row);
for (const r of sorted) {
  const conf = confidencePct(r.score);
  // Show the reading + a review nudge whenever the name match wasn't clean.
  const note = needsReview(r.score) ? `  ← read “${r.extractedName}” — verify` : "";
  const icon = FLAG_ICON[activityFlag(r.points)] ?? "  ";
  console.log(`  ${icon} ${r.entry.ign.padEnd(24)} ${String(r.points).padStart(6)}   ${String(conf).padStart(3)}%${note}`);
}
if (unknowns.length) {
  console.log("\n--- Unmatched names (new members?) ---");
  for (const u of unknowns) console.log(`  ${u.name} → ${u.points}`);
}
if (conflicts.length) {
  console.log("\n--- Conflicts ---");
  for (const c of conflicts) console.log(`  ${c.ign}: ${c.values.join(" / ")}`);
}
const missing = roster.filter((e) => !results.has(e.row));
if (missing.length) {
  console.log(`\n--- No value extracted (${missing.length}) ---`);
  for (const e of missing) console.log(`  ${e.ign} (${e.status})`);
}
