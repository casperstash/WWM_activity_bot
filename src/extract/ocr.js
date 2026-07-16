import { createWorker } from "tesseract.js";

let workerPromise = null;

function getWorker() {
  // One shared worker — recognizing 14 images sequentially reuses it.
  if (!workerPromise) workerPromise = createWorker("eng");
  return workerPromise;
}

export async function shutdownOcr() {
  if (workerPromise) {
    const w = await workerPromise;
    await w.terminate();
    workerPromise = null;
  }
}

/**
 * OCR one image buffer and parse candidate member rows.
 *
 * Layout-agnostic first pass: any OCR line whose tail is a plausible points
 * number (0–99999, optional thousands separators) becomes a candidate
 * { name, points, confidence }. Tune parseLine() once real screenshots
 * are available (TODO: sample-driven — column positions, UID column, etc.)
 */
export async function ocrImage(buffer) {
  const worker = await getWorker();
  const { data } = await worker.recognize(buffer);
  const rows = [];
  for (const line of data.lines ?? []) {
    const parsed = parseLine(line.text);
    if (parsed) rows.push({ ...parsed, confidence: line.confidence });
  }
  return { rows, meanConfidence: data.confidence };
}

const ROW_RE = /^(.{2,}?)[\s|]+([0-9][0-9.,\s]{0,6})\s*$/u;

function parseLine(text) {
  const t = text.trim();
  if (!t) return null;
  const m = t.match(ROW_RE);
  if (!m) return null;
  const points = Number(m[2].replace(/[.,\s]/g, ""));
  if (!Number.isFinite(points) || points > 99999) return null;
  const name = m[1].trim();
  if (!name) return null;
  return { name, points };
}
